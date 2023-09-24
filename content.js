var nextButton;
var prefetchedSessions;
var previousURL;
var translations;
var nextButton;
var foundPrompt;
var liveSession;
var fetchScript = document.createElement('script');
fetchScript.src = browser.runtime.getURL('fetch-override.js');
document.head.appendChild(fetchScript);

document.addEventListener('fetchSessions', function (event) {
    liveSession = event.detail;
    console.log('intercepted session fetch:', liveSession);
    //TODO: get out the livesession.data.json or whatever
});

loadPrefetchedSessions();

window.addEventListener("keydown", function(keyboardEvent) {
    if(keyboardEvent.key == "Enter") {
        keyboardEvent.stopImmediatePropagation();
        keyboardEvent.preventDefault();
        const customNextButton = this.document.getElementById("yourButtonButBetter");
        if (customNextButton != null) {
            console.log("enter key caught");
            checkAnswer();
        }
    }
}, true);

setInterval(() => {
    if (previousURL != window.location.href) {
        previousURL = window.location.href;
        if (window.location.href.toLowerCase().includes("duolingo.com/learn")) {
            loadPrefetchedSessions();
        }
    }
    if (document.getElementById("yourButtonButBetter") != null) {
        document.getElementById("yourButtonButBetter").onclick = function() {checkAnswer()}
        // temp workaround til i figure out why function seems to "die"(?) when challenge changes.
    }
}, 1000)
// insert custom next button on top of the original
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, () => {
    nextButton = document.querySelector('button[data-test="player-next"]');
    if (document.getElementById("yourButtonButBetter") == null) {
        console.log("Inserting custom next button");
        const newNode = document.createElement("div");
        //TODO: actual stylesheets for additional elements 
        newNode.style.height = "100%"; newNode.style.width = "100%"; newNode.style.position = "absolute"; newNode.style.top = "0"; newNode.style.cursor = "pointer";
        newNode.id = "yourButtonButBetter";
        newNode.onclick = function() {checkAnswer()};
        nextButton.parentElement.appendChild(newNode);
        console.log(newNode);
    }
});
function checkAnswer() {
    if (document.querySelector('div[data-test="challenge challenge-translate"]') != null || document.querySelector('div[data-test="challenge challenge-completeReverseTranslation"]') != null) {
        if (document.querySelector('textarea[data-test="challenge-translate-input"]') != null) {
            if (translations.length > 0) {
                const userinput = document.querySelector('textarea[data-test="challenge-translate-input"]').textContent.toLowerCase();
                for (var i = 0; i < translations.length; i++) {
                    console.log(translations[i]);
                    if (translations[i].test(userinput)) {
                        console.log("correct answer, clicking nextButton: " + userinput);
                        nextButton.click()
                    } else {
                        console.log("No match for: " + userinput);
                    }
                }
            } else {
                console.log("got no translations, clicking nextButton");
                nextButton.click();
            }
        } else {
            console.log("could not find textarea, clicking nextButton");
            nextButton.click();
        }
    } else {
        console.log("Not a translation challenge, clicking nextButton");
        nextButton.click();
    }
}
document.arrive('div[data-test="challenge challenge-translate"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge()
});
document.arrive('div[data-test="challenge challenge-completeReverseTranslation"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge()
});
function onTranslationChallenge() {
    console.log('New translation exercise!')
    // Automatically click button to switch from bubbles to keyboard
    const difficultyButton = document.querySelector('button[data-test="player-toggle-keyboard"]');
    if (difficultyButton != null) {
        if (difficultyButton.textContent == "Make harder" || difficultyButton.textContent == "Use keyboard") {
            //TODO: this isn't working for "Use keyboard" buttons
            // (and also wont work if the users UI language isn't set to english)
            console.log('Pressed "Make Harder" button!');
            difficultyButton.click();
        }
    }
    // delay to avoid picking up the previous challenge through transition animations
    setTimeout(function() {
        // get prompt from displayed sentence tokens
        const sentenceTokenNodes = document.querySelectorAll('[data-test="hint-token"]');
        var sentence = "";
        for (var i = 0; i < sentenceTokenNodes.length; i++) {
            sentence = sentence.concat(sentenceTokenNodes[i].textContent);
        }
        //TODO: Support audio prompts (grab ids for audio clips? i think the clip urls are stored in the challenges?)
        getPromptTranslations(sentence);
    }, 2000);
}
function loadPrefetchedSessions() {
    if (!('indexedDB' in window)) {
        alert("This browser doesn't support IndexedDB");
    } else {
        let openRequest = window.indexedDB.open('duolingo');
        openRequest.onsuccess = function() {
            console.log("opened duolingo database");
            let IDBRequest = openRequest.result.transaction('prefetchedSessions').objectStore('prefetchedSessions').getAll();
            IDBRequest.onsuccess = function() {
                console.log("Loaded Prefetched Sessions");
                prefetchedSessions = IDBRequest.result;
            }
            IDBRequest.onerror = function(event) {
                console.log(event);
            }
        };
        openRequest.onerror = function(event) {
            console.log(event);
        }
    }
}
function getPromptTranslations(prompt) {
    console.log("getting translations for prompt: " + prompt);
    translations = [];
    foundPrompt = false;
    //TODO: Rewrite this to prioritise use of the live session
    prefetchedSessions.forEach(prefetchedSession => {
        prefetchedSession.session.challenges.forEach(challenge => {
            extractTranslations(challenge, prompt);
        });
        if (Object.hasOwn(prefetchedSession.session, "adaptiveChallenges")) {
            prefetchedSession.session.adaptiveChallenges.forEach(challenge => {
                extractTranslations(challenge, prompt);
            });
        }
        prefetchedSession.session.adaptiveInterleavedChallenges.challenges.forEach(challenge => {
            extractTranslations(challenge, prompt);
        });
        prefetchedSession.session.easierAdaptiveChallenges.forEach(challenge => {
            extractTranslations(challenge, prompt);
        });
    });
    if (foundPrompt == false) {
        console.log("Couldn't find challenge with prompt: " + prompt);
        // if this happens it is because the session is not prefetched
        // (but may contain most of the same challenges if part of a level that does have a prefetched session)
    }
};
function extractTranslations(challenge, prompt) {
    if (challenge.prompt == prompt) {
        foundPrompt = true;
        console.log("found challenge matching prompt:");
        console.log(challenge);
        if (Object.hasOwn(challenge, "compactTranslations")) {
            challenge.compactTranslations.forEach(compactTranslation => {
                translations.push(new RegExp(compactTranslation.toLowerCase()
                        .replaceAll("[", "(")
                        .replaceAll("]", ")")
                        .replaceAll("/", "|")
                        .replaceAll("?", "\\??")
                        .replaceAll(".", "\\.?")
                        .replaceAll("!", "!?")
                        .replaceAll(",", ",?")
                        .replaceAll(" ", " ?")
                ));
            });
        }
        if (translations.length == 0) {
            console.log("Unable to extract translations from challenge:");
            console.log(challenge);
            //TODO: compactTranslations don't seem very reliable. This should be rewritten to use the grader object, which seems to be always present and have all translations.
        } else {
            console.log("translations:");
            console.log(translations);
        }
    }
}