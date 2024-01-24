// challenge variables
var nextButton;
var previousURL = "";
var foundPrompt = false;
var translationCorrect = false;
var currentChallenge = {};
var inValidChallenge = false;
var hasFailed = false;

// session variables
var prefetchedSessions = [];
var lastFetchedSession = {};

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
    lastFetchedSession = event.detail;
    console.log("Session fetched:",lastFetchedSession);
    // reload prefetched sessions
    loadPrefetchedSessions();
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
            console.warn("customNextButton is null");
        }
    }
}, true);

// load prefetched sessions when the user goes to their course homepage
setInterval(() => {
    if (previousURL != window.location.href) {
        previousURL = window.location.href;
        if (window.location.href.toLowerCase().includes("duolingo.com/learn")) {
            loadPrefetchedSessions();
            lastFetchedSession = null;
        }
    }
    //FIXME: why function "dies"(?) when challenge changes??
    let yourButtonButBetter = document.getElementById("yourButtonButBetter");
    if (yourButtonButBetter != null) {
        yourButtonButBetter.onclick = function() {checkAnswer()}
    }
}, 1000);

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
                console.warn(event);
            }
        };
        openRequest.onerror = function(event) {
            console.warn(event);
        }
    } else {
        console.warn("This browser does not support indexedDB");
    }
}

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
    inValidChallenge = false;
});
document.arrive('div[data-test="challenge challenge-partialReverseTranslate"]', {fireOnAttributesModification: true, existing: true}, () => {
    //TODO
});
document.arrive('div[data-test="challenge challenge-listen"]', {fireOnAttributesModification: true, existing: true}, () => {
    inValidChallenge = true;
});
document.arrive('div[data-test="challenge challenge-listenTap"]', {fireOnAttributesModification: true, existing: true}, () => {
    inValidChallenge = true;
});
document.arrive('div[data-test="challenge challenge-listenComplete"]', {fireOnAttributesModification: true, existing: true}, () => {
    //TODO
});
document.arrive('div[data-test="challenge challenge-translate"]', {fireOnAttributesModification: true, existing: true}, () => {
    inValidChallenge = true;
});
document.arrive('div[data-test="challenge challenge-completeReverseTranslation"]', {fireOnAttributesModification: true, existing: true}, () => {
    inValidChallenge = true;
});

function checkAnswer() {
    // this shouldn't happen but if it does lets not get stuck in a challenge
    if (nextButton == null) {
        console.warn("nextButton is null");
        return;
    }
    // prevent popup appearing if we've already failed
    if (hasFailed) {
        hasFailed = false;
        nextButton.click();
        return;
    }
    if (inValidChallenge) {
        // get sentence tokens
        const sentenceTokenNodes = document.querySelectorAll('[data-test="hint-token"]');
        if (sentenceTokenNodes == null) {
            console.warn("Could not get sentence token nodes");
            return;
        }
        let prompt = "";
        // extract challenge prompt from the sentence token labels
        for (var i = 0; i < sentenceTokenNodes.length; i++) {
            prompt = normalizeSentence(prompt.concat(sentenceTokenNodes[i].getAttribute('aria-label').toLowerCase()));
        }
        // get user input
        if (document.querySelector('textarea[data-test="challenge-translate-input"]') != null) {
            const userinput = normalizeSentence(document.querySelector('textarea[data-test="challenge-translate-input"]').textContent.toLowerCase());
            // search challenges for solutions
            translationCorrect = false;
            foundPrompt = false;
            if (lastFetchedSession != null) {
                forEachChallengeGetChallengeGrader(lastFetchedSession, prompt, userinput);
            }
            prefetchedSessions.forEach((prefetchedSession) => {
                forEachChallengeGetChallengeGrader(prefetchedSession.session, prompt, userinput);
            });
            // check user input against the solution grader and display prompt or move on
            if (foundPrompt) {
                translationCorrect = false;
                traverseGrader(1, userinput, 0);
            }
            if (!translationCorrect) {
                tryAgainPrompt();
                // debug logging:
                if (foundPrompt) {
                    console.log("incorrect! grader:", currentChallenge.grader.vertices);
                }
            } else {
                nextButton.click();
                if (document.getElementById("answer-enhancer-retry-prompt") != null) {
                    document.getElementById("answer-enhancer-retry-prompt").remove();
                }    
            }
        } else {
            // move on if textarea is null
            nextButton.click();
        }
    } else {
        // move on if this challenge type is not supported
        nextButton.click();
    }
}

// search challenges within the specified session
function forEachChallengeGetChallengeGrader(session, prompt, userinput) {
    session.challenges.forEach((challenge) => {
        gradeInputForChallenge(challenge, prompt, userinput);
    });
    // when are these other ones even used?
    if (Object.hasOwn(session, "adaptiveChallenges")) {
        session.adaptiveChallenges.forEach((challenge) => {
            gradeInputForChallenge(challenge, prompt, userinput);
        });
    }
    if (Object.hasOwn(session, "adaptiveInterleavedChallenges")) {
        session.adaptiveInterleavedChallenges.challenges.forEach((challenge) => {
            gradeInputForChallenge(challenge, prompt, userinput);
        });
    }
    if (Object.hasOwn(session, "easierAdaptiveChallenges")) {
        session.easierAdaptiveChallenges.forEach((challenge) => {
            gradeInputForChallenge(challenge, prompt, userinput);
        });
    }
}
// search for matching prompt or solution within the specified challenge
function gradeInputForChallenge(challenge, prompt, userinput) {
    // ignore challenges without prompts
    if (Object.hasOwn(challenge, "prompt") && !translationCorrect) {
        if (normalizeSentence(challenge.prompt) == prompt) {
            foundPrompt = true;
            currentChallenge = challenge
            if (currentChallenge.grader != null){ // token bubble challenges dont have a grader
                if (currentChallenge.grader.version != 0) {
                    console.warn("Grader has updated and may result in errors", currentChallenge);
                }
                if (currentChallenge.grader.whitespaceDelimited != true) {
                    console.warn("this challenge is not whitespace delimited and may result in errors", currentChallenge);
                }
            }
        } else if (normalizeSentence(challenge.prompt) == userinput) {
            // done for listen challenges as they dont have readable prompts
            console.debug(userinput, challenge.prompt);
            translationCorrect = true;
            console.log("User input matches prompt");
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

// recursively traverse the solution grader to resolve a correct translation
function traverseGrader(index, userinput, inputposition) {
    let vertex = currentChallenge.grader.vertices[index];
    if (vertex.length == 0) {
        // the grader ends with an empty vertex
        console.log("completed grader traversal");
        if (userinput.length == 0) {
            // since the compared part of the input is removed each iteration, if theres still input by the end it can't be correct.
            translationCorrect = true;
            console.log("translation is correct");
        } else {
            console.log("userinput is longer than grader length");
        }
    } else {
        if (userinput.length == 0) {
            userinput = " "; //workaround for incomplete sentences
        }
        for (let token of vertex) {
            // ignore auto and typo entries
            if (token.type != "typo" && token.auto != true && translationCorrect != true) {
                if (token.lenient == " ") {
                    // ignore spaces, the default typo system handles them well enough
                    traverseGrader(token.to, userinput, inputposition + token.lenient.length);
                } else if (userinput.startsWith(token.lenient)) {
                    traverseGrader(token.to, userinput.slice(token.lenient.length), inputposition + token.lenient.length);
                } else if (Object.hasOwn(token, "orig")) {
                    // seems to only handle punctuation & capitalization, which are ignored in this extension. included just in case other courses handle this differently.
                    if (userinput.startsWith(token.orig)) {
                        traverseGrader(token.to, userinput.slice(token.orig.length), inputposition + token.orig.length);
                    }
                }
            }
        }
    }
}

loadPrefetchedSessions();
console.info("Duolingo Answer Enhancer Loaded");