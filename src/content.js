var nextButton;
var prefetchedSessions;
var previousURL;
var translations;
var foundPrompt;
var liveSession;
var oldSession;
var compactedGrader = [];

// Insert web accessible script to override fetch method
var fetchScript = document.createElement('script');
fetchScript.src = browser.runtime.getURL('fetch-override.js');
document.head.appendChild(fetchScript);

// Listen for events from the fetch override
document.addEventListener('fetchSessions', (event) => {
    oldSession = liveSession;
    liveSession = event.detail;
    console.log('intercepted session fetch:', liveSession);
    // on learn page sometimes a session is sent. it is added to prefetched sessions.
    if (liveSession.id == oldSession.id) {alert("session Id matches old session")} // do sessions ever get sent twice?
    //TODO: would be nice to identify and track the correct session
    // did a practice session that only seemed to use the 'challenges' array. when are the other challenge types used? they seems to be duplicates... mostly?
});

// cancel enter key presses to prevent the challenge ending and instead run the custom answer checker
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

// load prefetched sessions when the user goes to their course homepage
setInterval(() => {
    if (previousURL != window.location.href) {
        previousURL = window.location.href;
        if (window.location.href.toLowerCase().includes("duolingo.com/learn")) {
            loadPrefetchedSessions();
        }
    }
    //FIXME: why function "dies"(?) when challenge changes??
    let yourButtonButBetter = document.getElementById("yourButtonButBetter");
    if (yourButtonButBetter != null) {
        yourButtonButBetter.onclick = function() {checkAnswer()}
    }
}, 1000)
// insert custom next button on top of the original
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, () => {
    nextButton = document.querySelector('button[data-test="player-next"]');
    if (nextButton != null) {
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
    } else {
        console.log("Couldn't find nextButton");
    }
});
// Check answer by comparing the textarea content to the list of translations
function checkAnswer() {
    if (nextButton == null) {
        console.error("Could not check answer as nextButton is null");
        return
    }
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
                console.log("find 0 translations, clicking nextButton");
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
// detect arrival of a new translation challenge
document.arrive('div[data-test="challenge challenge-translate"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge()
});
document.arrive('div[data-test="challenge challenge-completeReverseTranslation"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge()
});

// Automatically click button to switch from bubbles to keyboard and fetch the translations for the displayed prompt
function onTranslationChallenge() {
    console.log('New translation exercise!')
    const difficultyButton = document.querySelector('button[data-test="player-toggle-keyboard"]');
    if (difficultyButton != null) {
        if (difficultyButton.textContent == "Make harder" || difficultyButton.textContent == "Use keyboard") {
            //FIXME: this isn't working for "Use keyboard" buttons
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
// open duolingo indexed database and request prefetched sessions
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
// go through all challenges from the live and prefetched sessions to search for translations of a prompt
function getPromptTranslations(prompt) {
    //FIXME: somethings fucked! D:
    translations = [];
    foundPrompt = false;
    //if (liveSession != null) { searchSessionChallenges(liveSession, prompt) }
    prefetchedSessions.forEach((prefetchedSession) => {
        searchSessionChallenges(prefetchedSession.session, prompt)
    });
    if (foundPrompt == false) {
        console.error("Couldn't find challenge with prompt: " + prompt);
    }
};

// check translations for all challenge types for the specified session
function searchSessionChallenges(session, prompt) {
    session.challenges.forEach((challenge) => {
        extractTranslationsFromChallenge(challenge, prompt);
    });
    if (Object.hasOwn(session, "adaptiveChallenges")) {
        session.adaptiveChallenges.forEach((challenge) => {
            extractTranslationsFromChallenge(challenge, prompt);
        });
    }
    session.adaptiveInterleavedChallenges.challenges.forEach((challenge) => {
        extractTranslationsFromChallenge(challenge, prompt);
    });
    session.easierAdaptiveChallenges.forEach((challenge) => {
        extractTranslationsFromChallenge(challenge, prompt);
    });
}
// get compactTranslations and turn them into regex
function extractTranslationsFromChallenge(challenge, prompt) {
    if (challenge.prompt == prompt) {
        foundPrompt = true;
        if (Object.hasOwn(challenge, "compactTranslations")) {
            challenge.compactTranslations.forEach((compactTranslation) => {
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
        compactedGrader = [];
        consumeVertex(challenge.grader.vertices, 1, "");
        console.log(compactedGrader);
        //console.log(compactedGrader);
        //console.log(challenge.compactTranslations);
        //console.log(challenge.grader.vertices);
        return
        if (translations.length == 0) {
            console.error("Unable to extract translations from challenge:", challenge.prompt);
            //TODO: compactTranslations don't seem very reliable. This should be rewritten to use the grader object, which seems to be always present and have all translations.
        } else {
            console.log("translations:", translations);
        }
    }
}

//good debug sentence, 132 solution variants (!!!)
setTimeout(() => {
    getPromptTranslations("The tiger thinks that you look like a good person.");
}, 2000);

// recursively traverse the solution graph to resolve each translation
function consumeVertex(vertices, index, compactedTranslation) {
    let vertex = vertices[index];
    if (vertex.length == 0) {
        // the grader ends with an empty vertex, so the translation should be complete at this point.
        compactedGrader.push(compactedTranslation);
    } else {
        vertex.forEach((token) => {
            consumeVertex(vertices, token.to, compactedTranslation + token.lenient);
            // it works!!!
            //TODO: including token.orig should make this on par with compact translations
        })
    }
}