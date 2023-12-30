// challenge variables
var nextButton;
var previousURL = "";
var foundPrompt = false;
var translationCorrect = false;
var possibleErrors = [];
var currentChallenge = {};
var inValidChallenge = false;
var isListenChallenge = false;
var hasFailed = false;

// session variables
var prefetchedSessions = [];
var liveSession = {};

// document variables
var fetchScript = document.createElement('script');
var styleSheet = document.createElement('link');
fetchScript.src = browser.runtime.getURL('fetch-override.js');
styleSheet.href = browser.runtime.getURL('styles.css');
styleSheet.rel = "stylesheet";
document.head.appendChild(fetchScript);
document.head.appendChild(styleSheet);

// Listen for events from the fetch override
document.addEventListener('fetchSessions', (event) => {
    liveSession = event.detail;
});

// cancel enter key presses to prevent the challenge ending and instead run the custom answer checker
window.addEventListener("keydown", function(keyboardEvent) {
    if(keyboardEvent.key == "Enter") {
        keyboardEvent.stopImmediatePropagation();
        keyboardEvent.preventDefault();
        const customNextButton = this.document.getElementById("yourButtonButBetter");
        if (customNextButton != null) {
            checkAnswer();
        } else {
            console.error("customNextButton is null");
        }
    }
}, true);

// load prefetched sessions when the user goes to their course homepage
setInterval(() => {
    if (previousURL != window.location.href) {
        previousURL = window.location.href;
        if (window.location.href.toLowerCase().includes("duolingo.com/learn")) {
            loadPrefetchedSessions();
            liveSession = null;
        }
    }
    //FIXME: why function "dies"(?) when challenge changes??
    let yourButtonButBetter = document.getElementById("yourButtonButBetter");
    if (yourButtonButBetter != null) {
        yourButtonButBetter.onclick = function() {checkAnswer()}
    }
}, 1000);

// insert a prompt to try again with a letter hint
function tryAgainPrompt() {
    if (document.getElementById("answer-enhancer-retry-prompt") == null) {
        const retryElement = document.createElement("div");
        retryElement.id = "answer-enhancer-retry-prompt";
        const innerDiv = document.createElement("div");
        innerDiv.className = "answer-enhancer-inner";
        const retryHeader = document.createElement("h2");
        retryHeader.textContent = "Try again.";
        document.getElementById("session/PlayerFooter").style.borderTop = "none";
        document.getElementById("session/PlayerFooter").parentElement.prepend(retryElement);
        retryElement.appendChild(innerDiv);
        innerDiv.appendChild(retryHeader);
    } else {
        const difficultyButton = document.querySelector('button[data-test="player-toggle-keyboard"]');
        if (difficultyButton != null) {
            difficultyButton.click();
        } else {
            nextButton.click();
        }
        document.getElementById("answer-enhancer-retry-prompt").remove();
        hasFailed = true;
    }
}

// remove try again prompt when user switches to word bank
document.arrive('div[data-test="word-bank"]', {fireOnAttributesModification: true, existing: true}, () => {
    if (document.getElementById("answer-enhancer-retry-prompt") != null) {
        document.getElementById("answer-enhancer-retry-prompt").remove();
    }
});

// press button to switch to harder difficulty challenge
document.arrive('button[data-test="player-toggle-keyboard"]', (difficultyButton) => {
    const buttonImg = difficultyButton.getElementsByTagName('img')[0].src;
    if (buttonImg == "https://d35aaqx5ub95lt.cloudfront.net/images/ed8f358a87ca3b9ba9cce34f5b0e0e11.svg" || buttonImg == "https://d35aaqx5ub95lt.cloudfront.net/images/05087a35a607783111e11cb81d1fcd33.svg") {
        difficultyButton.click();
    }
})

// insert custom next button on top of the original
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, (arrivingElement) => {
    nextButton = arrivingElement;
    if (document.getElementById("yourButtonButBetter") == null) {
        const newNode = document.createElement("div");
        newNode.id = "yourButtonButBetter";
        newNode.onclick = function() {checkAnswer()};
        nextButton.parentElement.appendChild(newNode);
    }
});

// handle arrival of new challenges
document.arrive('h1[data-test="challenge-header"]', {fireOnAttributesModification: true, existing: true}, () => {
    currentChallenge = null;
    isListenChallenge = false;
    inValidChallenge = false;
});
document.arrive('div[data-test="challenge challenge-partialReverseTranslate"]', {fireOnAttributesModification: true, existing: true}, () => {
    //TODO
});
document.arrive('div[data-test="challenge challenge-listen"]', {fireOnAttributesModification: true, existing: true}, () => {
    onListenChallenge();
});
document.arrive('div[data-test="challenge challenge-listenTap"]', {fireOnAttributesModification: true, existing: true}, () => {
    onListenChallenge();
});
document.arrive('div[data-test="challenge challenge-listenComplete"]', {fireOnAttributesModification: true, existing: true}, () => {
    //TODO
});
document.arrive('div[data-test="challenge challenge-translate"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge();
});
document.arrive('div[data-test="challenge challenge-completeReverseTranslation"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge();
    //some (all?) of these challenges are actually writing in swedish though?
});

function onListenChallenge() {
    setTimeout(function() {
        inValidChallenge = true;
        isListenChallenge = true;
    }, 2000);
}

// delay for transition animations then find which challenge corresponds to the token labels
function onTranslationChallenge() {
    inValidChallenge = true;
    setTimeout(function() {
        const sentenceTokenNodes = document.querySelectorAll('[data-test="hint-token"]');
        if (sentenceTokenNodes == null) {
            console.error("Could not get sentence token nodes");
        } else {
            let prompt = "";
            for (var i = 0; i < sentenceTokenNodes.length; i++) {
                prompt = prompt.concat(sentenceTokenNodes[i].getAttribute('aria-label').toLowerCase());
            }
            translations = [];
            foundPrompt = false;
            if (liveSession != null) {
                searchSessionChallenges(liveSession, prompt, false);
            }
            prefetchedSessions.forEach((prefetchedSession) => {
                searchSessionChallenges(prefetchedSession.session, prompt, false);
            });
            if (foundPrompt == false) {
                inValidChallenge = false;
                console.error("Couldn't find challenge with prompt: ", prompt);
                //FIXME: sometimes hint tokens are hidden, thus no prompt is found.
                // could instead get text from element with z-index: 150 that contains the letters in the speech bubble
            }
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

// check translations for all challenge types for the specified session
function searchSessionChallenges(session, prompt, isListenChallenge) {
    session.challenges.forEach((challenge) => {
        getChallengeGrader(challenge, prompt, isListenChallenge);
    });
    // when are these other ones even used?
    if (Object.hasOwn(session, "adaptiveChallenges")) {
        session.adaptiveChallenges.forEach((challenge) => {
            getChallengeGrader(challenge, prompt, isListenChallenge);
        });
    }
    if (Object.hasOwn(session, "adaptiveInterleavedChallenges")) {
        session.adaptiveInterleavedChallenges.challenges.forEach((challenge) => {
            getChallengeGrader(challenge, prompt, isListenChallenge);
        });
    }
    if (Object.hasOwn(session, "easierAdaptiveChallenges")) {
        session.easierAdaptiveChallenges.forEach((challenge) => {
            getChallengeGrader(challenge, prompt, isListenChallenge);
        });
    }
}
// get translations from a challenge and turn them into regex.
function getChallengeGrader(challenge, prompt, isListenChallenge) {
    if (isListenChallenge) {
        if (challenge.type == "listen" || challenge.type == "listenTap" || challenge.type == "listenComplete") {
            if (Object.hasOwn(challenge, "grader")) {
                if (Object.hasOwn(challenge, "solutionTranslation")) {
                    if (normalizeSentence(challenge.solutionTranslation) == prompt) {
                        translationCorrect = true;
                    }
                }
                if (Object.hasOwn(challenge, "prompt")) {
                    console.log(prompt, challenge.prompt)
                    if (normalizeSentence(challenge.prompt) == prompt) {
                        translationCorrect = true;
                    }
                }
            }
        }
    } else {
        if (challenge.prompt != null) {
            if (normalizeSentence(challenge.prompt) == normalizeSentence(prompt)) {
                foundPrompt = true;
                currentChallenge = challenge
                if (currentChallenge.grader.version != 0) {
                    console.warn("Grader has updated and may result in errors");
                }
                if (currentChallenge.grader.whitespaceDelimited != true) {
                    console.warn("this challenge is not whitespace delimited and may result in errors");
                }
            }
        }
    }
}

function normalizeSentence(sentence) {
    return sentence.toLowerCase()
        .replaceAll("?", "")
        .replaceAll(".", "")
        .replaceAll("!", "")
        .replaceAll(",", "")
        .replaceAll("'", "")
        .replaceAll(" ", "")
        .replaceAll("-", "")
        .replaceAll(":", "")
}

// Check answer by comparing the textarea content to the list of translations
function checkAnswer() {
    if (nextButton == null) {
        console.error("nextButton is null");
        return;
    }
    if (hasFailed) {
        hasFailed = false;
        nextButton.click();
        return;
    }
    if (inValidChallenge) {
        if (document.querySelector('textarea[data-test="challenge-translate-input"]') != null) {
            const userinput = document.querySelector('textarea[data-test="challenge-translate-input"]').textContent.toLowerCase();
            if (isListenChallenge) {
                translationCorrect = false;
                if (liveSession != null) {
                    searchSessionChallenges(liveSession, normalizeSentence(userinput), true);
                }
                prefetchedSessions.forEach((prefetchedSession) => {
                    searchSessionChallenges(prefetchedSession.session, normalizeSentence(userinput), true);
                });
                if (translationCorrect) {
                    if (document.getElementById("answer-enhancer-retry-prompt") != null) {
                        document.getElementById("answer-enhancer-retry-prompt").remove();
                    }
                    nextButton.click();
                } else {
                    tryAgainPrompt();
                }

            } else {
                translationCorrect = false;
                possibleErrors = [];
                traverseGrader(1, userinput, 0);
                if (!translationCorrect) {
                    tryAgainPrompt();
                } else {
                    nextButton.click();
                    if (document.getElementById("answer-enhancer-retry-prompt") != null) {
                        document.getElementById("answer-enhancer-retry-prompt").remove();
                    }    
                }
            }
        } else {
            nextButton.click();
        }
    } else {
        nextButton.click();
    }
}

// recursively traverse the solution graph to resolve a correct translation, discarding auto & typo entries
function traverseGrader(index, userinput, inputposition) {
    let vertex = currentChallenge.grader.vertices[index];
    if (vertex.length == 0) {
        // the grader ends with an empty vertex
        if (userinput.length > 0) {
            // theres more so its not actually correct i guess. i think thats what was going on here.
        } else {
            translationCorrect = true;
        }
    } else {
        if (userinput.length == 0) {
            userinput = " "; //workaround for incomplete sentences
        }
        for (let token of vertex) {
            if (token.type != "typo" && token.auto != true && translationCorrect != true) {
                    if (userinput.startsWith(token.lenient)) {
                    traverseGrader(token.to, userinput.slice(token.lenient.length), inputposition + token.lenient.length);
                } else if (Object.hasOwn(token, "orig")) {
                    if (userinput.startsWith(token.orig)) {
                        traverseGrader(token.to, userinput.slice(token.orig.length), inputposition + token.orig.length);
                    }
                }
            }
        }
    }
}

loadPrefetchedSessions();
console.log("Duolingo Answer Enhancer Loaded");