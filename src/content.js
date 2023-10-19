var nextButton;
var prefetchedSessions;
var previousURL = "";
var solutionGrader;
var foundPrompt = false;
var liveSession;
var translationCorrect = false;
var possibleErrors = [];
var hasFailed = false;

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
}, 1000);

function replaceNextButton() {
    if (nextButton != null) {
        if (document.getElementById("yourButtonButBetter") == null) {
            const newNode = document.createElement("div");
            newNode.id = "yourButtonButBetter";
            newNode.onclick = function() {checkAnswer()};
            nextButton.parentElement.appendChild(newNode);
        }
    } else {
        console.error("Couldn't find nextButton");
    }
}

// insert a prompt to try again with a letter hint
function tryAgainPrompt(hintMessage) {
    if (document.getElementById("answer-enhancer-retry-prompt") == null) {
        const retryElement = document.createElement("div");
        retryElement.id = "answer-enhancer-retry-prompt";
        const innerDiv = document.createElement("div");
        const retryHeader = document.createElement("h2");
        retryHeader.textContent = "Try again.";
        const retryHint = document.createElement("div");
        retryHint.id = "answer-enhancer-retry-hint"; retryHint.textContent = "Letter hint: " + hintMessage;
        document.getElementById("session/PlayerFooter").style.borderTop = "none";
        document.getElementById("session/PlayerFooter").parentElement.prepend(retryElement);
        retryElement.appendChild(innerDiv);
        innerDiv.appendChild(retryHeader);
        innerDiv.appendChild(retryHint);
    } else {
        //document.getElementById("answer-enhancer-retry-hint").textContent = "Letter hint: " + hintMessage;
        nextButton.click();
        if (document.getElementById("answer-enhancer-retry-prompt") != null) {
            document.getElementById("answer-enhancer-retry-prompt").remove();
            hasFailed = true;
        }
    }
}

// insert custom next button on top of the original
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, () => {
    nextButton = document.querySelector('button[data-test="player-next"]');
    replaceNextButton();
});

// detect arrival of a new translation challenge
//TODO: support "challenge challenge-partialReverseTranslate" and reverse. translation input is a label containing a contenteditable span.
document.arrive('div[data-test="challenge challenge-translate"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge();
});
document.arrive('div[data-test="challenge challenge-completeReverseTranslation"]', {fireOnAttributesModification: true, existing: true}, () => {
    onTranslationChallenge();
});

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
    if (document.querySelector('div[data-test="challenge challenge-translate"]') != null || document.querySelector('div[data-test="challenge challenge-completeReverseTranslation"]') != null) {
        if (document.querySelector('textarea[data-test="challenge-translate-input"]') != null) {
            const userinput = document.querySelector('textarea[data-test="challenge-translate-input"]').textContent.toLowerCase();
            translationCorrect = false;
            possibleErrors = [];
            readVertex(1, userinput, 0);
            if (!translationCorrect) {
                let chosenErrors = [possibleErrors[0]];
                possibleErrors.forEach((possibleError) => {
                    if (possibleError.index > chosenErrors[0].index) {
                        chosenErrors = [possibleError];
                    } else if (possibleError.index == chosenErrors[0].index) {
                        chosenErrors.push(possibleError);
                    }
                })
                // errors in the same position are likely all valid hints so select one randomly
                if (chosenErrors.length > 1) {
                    const random = Math.floor(Math.random() * chosenErrors.length);
                    tryAgainPrompt(chosenErrors[random].character);
                } else {
                    tryAgainPrompt(chosenErrors[0].character);
                }
            } else {
                nextButton.click();
                if (document.getElementById("answer-enhancer-retry-prompt") != null) {
                    document.getElementById("answer-enhancer-retry-prompt").remove();
                }
            }
        } else {
            nextButton.click();
        }
    } else {
        nextButton.click();
    }
}

// Automatically click button to switch from bubbles to keyboard and fetch the grader for the challenge
function onTranslationChallenge() {
    const difficultyButton = document.querySelector('button[data-test="player-toggle-keyboard"]');
    if (difficultyButton != null) {
        const buttonImg = difficultyButton.getElementsByTagName('img')[0].src;
        if (buttonImg == "https://d35aaqx5ub95lt.cloudfront.net/images/ed8f358a87ca3b9ba9cce34f5b0e0e11.svg" || buttonImg == "https://d35aaqx5ub95lt.cloudfront.net/images/05087a35a607783111e11cb81d1fcd33.svg") {
            difficultyButton.click();
        }
    }
    // delay to avoid picking up the previous challenge through transition animations
    setTimeout(function() {
        // get prompt from sentence token labels
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
                searchSessionChallenges(liveSession, prompt);
            }
            prefetchedSessions.forEach((prefetchedSession) => {
                searchSessionChallenges(prefetchedSession.session, prompt);
            });
            if (foundPrompt == false) {
                console.error("Couldn't find challenge with prompt: ", prompt);
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
        if (normalizeSentence(challenge.prompt) == normalizeSentence(prompt)) {
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

// recursively traverse the solution graph to resolve a correct translation, discarding auto & typo entries
function readVertex(index, userinput, inputposition) {
    if (userinput == "") {
        userinput = " "; //workaround for incomplete sentences
    }
    let vertex = solutionGrader.vertices[index];
    if (vertex.length == 0) {
        // the grader ends with an empty vertex, so the translation should be correct at this point.
        translationCorrect = true;
    } else {
        for (let token of vertex) {
            if (token.type != "typo" && token.auto != true && translationCorrect != true) {
                if (tokenMatchesInput(userinput, token.lenient, inputposition)) {
                    readVertex(token.to, userinput.slice(token.lenient.length), inputposition + token.lenient.length);
                } else if (Object.hasOwn(token, "orig")) {
                    if (tokenMatchesInput(userinput, token.orig, inputposition)) {
                        readVertex(token.to, userinput.slice(token.orig.length), inputposition + token.orig.length);
                    }
                }
            }
        }
    }
}

// return true on match or return false and add the error to the errors list
function tokenMatchesInput(userinput, tokenContent, inputposition) {
    let nonMatchingCharacter = null;
    for (var i = 0; i < tokenContent.length; i++) {
        if (userinput[i] != tokenContent[i]) {
            if (tokenContent[i] == " " || userinput[i + 1] == tokenContent[i]) {
                nonMatchingCharacter = {"index": inputposition + i, "character":"❌" + userinput[i]};
            } else {
                nonMatchingCharacter = {"index": inputposition + i, "character": tokenContent[i]};
            }
            break;
        }
    }
    if (nonMatchingCharacter != null) {
        possibleErrors.push(nonMatchingCharacter);
        return false;
    } else {
        return true;
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
loadPrefetchedSessions();