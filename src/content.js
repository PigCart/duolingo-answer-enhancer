var nextButton;
var prefetchedSessions;
var previousURL;
var solutionGrader;
var foundPrompt;
var liveSession;
var translationCorrect;
var hintMessage;

// Insert web accessible script to override fetch method
var fetchScript = document.createElement('script');
fetchScript.src = browser.runtime.getURL('fetch-override.js');
document.head.appendChild(fetchScript);

// Listen for events from the fetch override
document.addEventListener('fetchSessions', (event) => {
    liveSession = event.detail;
    console.log('intercepted session fetch:', liveSession);
    // on learn page sometimes a session is sent. it is added to prefetched sessions.
});

// cancel enter key presses to prevent the challenge ending and instead run the custom answer checker
window.addEventListener("keydown", function(keyboardEvent) {
    if(keyboardEvent.key == "Enter") {
        keyboardEvent.stopImmediatePropagation();
        keyboardEvent.preventDefault();
        const customNextButton = this.document.getElementById("yourButtonButBetter");
        if (customNextButton != null) {
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

function replaceNextButton() {
    if (nextButton != null) {
        if (document.getElementById("yourButtonButBetter") == null) {
            const newNode = document.createElement("div");
            newNode.style.height = "100%"; newNode.style.width = "100%"; newNode.style.position = "absolute"; newNode.style.top = "0"; newNode.style.cursor = "pointer";
            newNode.id = "yourButtonButBetter";
            newNode.onclick = function() {checkAnswer()};
            nextButton.parentElement.appendChild(newNode);
        }
    } else {
        console.error("Couldn't find nextButton");
    }
}

function tryAgainPrompt(hintMessage) {
    if (document.getElementById("answer-enhancer-retry-prompt") == null) {
        console.log("try again lol :3");
        const retryElement = document.createElement("div");
        retryElement.id = "answer-enhancer-retry-prompt";
        retryElement.style.background = "#ffeebb88"; retryElement.style.width = "100%"; retryElement.style.zIndex = "24"; retryElement.style.position = "relative";
        retryElement.style.bottom = "50px"; retryElement.style.padding = "16px"; retryElement.style.maxWidth = "1080px"; retryElement.style.margin = "0 auto";
        const retryHeader = document.createElement("h2");
        retryHeader.style.margin = "0"; retryHeader.textContent = "Try again";
        const retryHint = document.createElement("div");
        retryHint.id = "answer-enhancer-retry-hint";
        retryHint.textContent = "Hint: " + hintMessage;
        document.getElementById("session/PlayerFooter").parentElement.appendChild(retryElement);
        retryElement.appendChild(retryHeader);
        retryElement.appendChild(retryHint);
    } else {
        document.getElementById("answer-enhancer-retry-hint").textContent = "Hint: " + hintMessage;
    }
}

// remove retry prompt when footer updates
document.arrive('div[data-test="blame blame-correct"]', {fireOnAttributesModification: true, existing: true}, () => {
    if (document.getElementById("answer-enhancer-retry-prompt") != null) {
        document.getElementById("answer-enhancer-retry-prompt").remove();
    }
});
document.arrive('div[data-test="blame blame-incorrect"]', {fireOnAttributesModification: true, existing: true}, () => {
    if (document.getElementById("answer-enhancer-retry-prompt") != null) {
        document.getElementById("answer-enhancer-retry-prompt").remove();
    }
});

// insert custom next button on top of the original
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, () => {
    nextButton = document.querySelector('button[data-test="player-next"]');
    replaceNextButton();
});

// detect arrival of a new translation challenge
document.arrive('div[data-test="challenge challenge-translate"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge()
});
document.arrive('div[data-test="challenge challenge-completeReverseTranslation"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge()
});

// Check answer by comparing the textarea content to the list of translations
function checkAnswer() {
    if (nextButton == null) {
        console.error("Could not check answer as nextButton is null");
        return
    }
    if (document.querySelector('div[data-test="challenge challenge-translate"]') != null || document.querySelector('div[data-test="challenge challenge-completeReverseTranslation"]') != null) {
        if (document.querySelector('textarea[data-test="challenge-translate-input"]') != null) {
            //if (translations.length > 0) {
                const userinput = document.querySelector('textarea[data-test="challenge-translate-input"]').textContent.toLowerCase().replaceAll(" ", "");
                translationCorrect = false;
                console.log(solutionGrader.vertices);
                readVertex(1, userinput);
                if (!translationCorrect) {
                    tryAgainPrompt(hintMessage);
                } else {
                    nextButton.click();
                }
            /*} else {
                console.error("Could not find translations");
                nextButton.click();
            }*/
        } else {
            nextButton.click();
        }
    } else {
        nextButton.click();
    }
}

// Automatically click button to switch from bubbles to keyboard and fetch the translations for the displayed prompt
function onTranslationChallenge() {
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
        // get prompt from sentence token labels
        const sentenceTokenNodes = document.querySelectorAll('[data-test="hint-token"]');
        if (sentenceTokenNodes == null) {
            console.error("Could not get sentence token nodes")
        } else {
            let sentence = "";
            for (var i = 0; i < sentenceTokenNodes.length; i++) {
                sentence = sentence.concat(sentenceTokenNodes[i].getAttribute('aria-label').toLowerCase());
            }
            //TODO: Support audio prompts (grab ids for audio clips? i think the clip urls are stored in the challenges?)
            findGraderForPrompt(sentence);
        }
    }, 2000);
}
// open duolingo indexed database and request prefetched sessions
function loadPrefetchedSessions() {
    if ('indexedDB' in window) {
        let openRequest = window.indexedDB.open('duolingo');
        openRequest.onsuccess = function() {
            let IDBRequest = openRequest.result.transaction('prefetchedSessions').objectStore('prefetchedSessions').getAll();
            IDBRequest.onsuccess = function() {
                prefetchedSessions = IDBRequest.result;
            }
            IDBRequest.onerror = function(event) {
                console.error(event);
            }
        };
        openRequest.onerror = function(event) {
            console.error(event);
        }
    }
}
// go through all challenges from the live and prefetched sessions to search for translations of a prompt
function findGraderForPrompt(prompt) {
    translations = [];
    foundPrompt = false;
    if (liveSession != null) {
        searchSessionChallenges(liveSession, prompt)
    }
    prefetchedSessions.forEach((prefetchedSession) => {
        searchSessionChallenges(prefetchedSession.session, prompt)
    });
    if (foundPrompt == false) {
        console.error("Couldn't find challenge with prompt: ", prompt);
    }
};

// check translations for all challenge types for the specified session
function searchSessionChallenges(session, prompt) {
    session.challenges.forEach((challenge) => {
        getChallengeGrader(challenge, prompt);
    });
    if (Object.hasOwn(session, "adaptiveChallenges")) {
        session.adaptiveChallenges.forEach((challenge) => {
            getChallengeGrader(challenge, prompt);
        });
    }
    session.adaptiveInterleavedChallenges.challenges.forEach((challenge) => {
        getChallengeGrader(challenge, prompt);
    });
    session.easierAdaptiveChallenges.forEach((challenge) => {
        getChallengeGrader(challenge, prompt);
    });
}
// get translations from a challenge and turn them into regex.
function getChallengeGrader(challenge, prompt) {
    if (challenge.prompt != null){
        let challengePromptRegex = sentenceToRegex(challenge.prompt);
        if (challengePromptRegex.test(prompt)) {
            foundPrompt = true;
            solutionGrader = challenge.grader
            if (solutionGrader.version != 0) {
                console.log("Grader has updated and may result in errors");
            }
            if (solutionGrader.whitespaceDelimited != true) {
                console.log("this challenge is not whitespace delimited and may result in errors");
            }
        }
    }
}

// recursively traverse the solution graph to resolve each translation, discarding typo entries
function readVertex(index, userinput) {
    let vertex = solutionGrader.vertices[index];
    if (vertex.length == 0) {
        // the grader ends with an empty vertex, so the translation should be complete at this point.
        translationCorrect = true;
        console.log("done");
    } else {
        vertex.forEach((token) => {
            if (token.type != "typo" && token.auto != true) {
                if (Object.hasOwn(token, "orig")) {
                    if (userinput.startsWith(token.orig)) {
                        //readVertex(token.to, userinput.slice(token.orig.length));
                    }
                }
                console.log(index + "+" + token.lenient + "+" + userinput);
                if (token.lenient == " ") {
                    readVertex(token.to, userinput);
                } else if (userinput.startsWith(token.lenient)) {
                    readVertex(token.to, userinput.slice(token.lenient.length));
                } else {
                    hintMessage = token.lenient;
                }
            }
        })
    }
}

// convert compactTranslations to valid regex and ignore punctuation in translations or prompts
function sentenceToRegex(translationString) {
    return RegExp("^" + translationString.toLowerCase()
        .replaceAll("[", "(")
        .replaceAll("]", ")")
        .replaceAll("/", "|")
        .replaceAll("?", "\\??")
        .replaceAll(".", "\\.?")
        .replaceAll("!", "!?")
        .replaceAll(",", ",?")
        .replaceAll("'", "'?")
        .replaceAll(" ", " ?")
        + "$"
    )
}
loadPrefetchedSessions();