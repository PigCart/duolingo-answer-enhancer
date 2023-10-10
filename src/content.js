var nextButton;
var prefetchedSessions;
var previousURL;
var translations;
var foundPrompt;
var liveSession;

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
// insert custom next button on top of the original
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, () => {
    nextButton = document.querySelector('button[data-test="player-next"]');
    if (nextButton != null) {
        if (document.getElementById("yourButtonButBetter") == null) {
            const newNode = document.createElement("div");
            //TODO: actual stylesheets for additional elements 
            newNode.style.height = "100%"; newNode.style.width = "100%"; newNode.style.position = "absolute"; newNode.style.top = "0"; newNode.style.cursor = "pointer";
            newNode.id = "yourButtonButBetter";
            newNode.onclick = function() {checkAnswer()};
            nextButton.parentElement.appendChild(newNode);
        }
    } else {
        console.error("Couldn't find nextButton");
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
                    if (translations[i].test(userinput)) {
                        console.log("correct answer, clicking nextButton: " + userinput);
                        nextButton.click()
                        return
                    } else {
                        console.error("No match for: " + userinput);
                        return
                    }
                }
            } else {
                console.error("Could not find translations");
                nextButton.click();
            }
        } else {
            nextButton.click();
        }
    } else {
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
        let labels = [];
        for (var i = 0; i < sentenceTokenNodes.length; i++) {
            labels.push(sentenceTokenNodes[i].getAttribute('aria-label'));
        }
        let sentence = labels.join(" ").toLowerCase()
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
function getPromptTranslations(prompt) {
    translations = [];
    foundPrompt = false;
    if (liveSession != null) { searchSessionChallenges(liveSession, prompt) }
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
// get translations from a challenge and turn them into regex. Fall back to grader if compactTranslations arent present
function extractTranslationsFromChallenge(challenge, prompt) {
    if (challenge.prompt != null){
        let challengePromptRegex = sentenceToRegex(challenge.prompt);
        if (challengePromptRegex.test(prompt)) {
            foundPrompt = true;
            if (Object.hasOwn(challenge, "compactTranslations")) {
                challenge.compactTranslations.forEach((compactTranslation) => {
                    translations.push(sentenceToRegex(compactTranslation));
                });
            }
            readVertex(challenge.grader.vertices, 0, "");
            if (translations.length == 0) {
                console.error("Unable to extract translations from challenge:", challenge.prompt);
            } else {
                console.log("translations:", translations);
            }
        }
    }
}

// recursively traverse the solution graph to resolve each translation, discarding typo entries
function readVertex(vertices, index, graderTranslation) {
    let vertex = vertices[index];
    if (vertex.length == 0) {
        // the grader ends with an empty vertex, so the translation should be complete at this point.
        translations.push(sentenceToRegex(graderTranslation));
    } else {
        // bundle tokens in this vertex together if they have the same destination
        // not really neccessary but make it easier to read when debugging
        let shouldBundleTokens = false;
        if (vertex.length > 1) {
            let tokensWithSameDestination = 0;
            vertex.forEach((token) => {
                if (token.to == vertex[0].to) {
                    tokensWithSameDestination++
                }
            })
            shouldBundleTokens = tokensWithSameDestination == vertex.length
            if (shouldBundleTokens) {
                let bundledTokens = []
                vertex.forEach((token) => {
                    if (token.type != "typo" && token.auto != true) {
                        if (Object.hasOwn(token, "orig")) {
                            bundledTokens.push(token.orig);
                        } else {
                            bundledTokens.push(token.lenient);
                        }
                    }
                })
                readVertex(vertices, vertex[0].to, graderTranslation + "[" + bundledTokens.join("/") + "]");
                return
            }
        }
        // or continue building translation without bundling, branching for each token
        if (!shouldBundleTokens) {
            vertex.forEach((token) => {
                if (token.type != "typo" && token.auto != true) {
                    if (Object.hasOwn(token, "orig")) {
                        readVertex(vertices, token.to, graderTranslation + token.orig);
                    } else {
                        readVertex(vertices, token.to, graderTranslation + token.lenient);
                    }
                }
            })
        }
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
        .replaceAll(" ", " ?")
        + "$"
    )
}