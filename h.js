var nextButton;
var prefetchedSessions;
var previousURL;
var translations;
var nextButton;

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
    }
}, 1000)
// replace the next button with a custom one
document.arrive('button[data-test="player-next"]', {fireOnAttributesModification: true, existing: true}, () => {
    nextButton = document.querySelector('button[data-test="player-next"]');
    if (document.getElementById("yourButtonButBetter") == null) {
        console.log("Inserting custom next button");
        const newNode = document.createElement("div");
        //TODO: actual stylesheets for additional elements 
        newNode.style.height = "100%"; newNode.style.width = "100%"; newNode.style.position = "absolute"; newNode.style.top = "0";
        newNode.id = "yourButtonButBetter";
        newNode.onclick = function() {checkAnswer()};
        nextButton.parentElement.appendChild(newNode);
        console.log(newNode);
    }
});
function checkAnswer() {
    console.log("checking answer");
    // if this is a translaiton challenge, check the user input against the list of translations
    if (document.querySelector('div[data-test="challenge challenge-translate"]') != null || document.querySelector('div[data-test="challenge challenge-completeReverseTranslation"]') != null) {
        if (document.querySelector('textarea[data-test="challenge-translate-input"]') != null) {
            const userinput = document.querySelector('textarea[data-test="challenge-translate-input"]').textContent.toLowerCase();
            for (var i = 0; i < translations.length; i++) {
                console.log(translations[i]);
                if (userinput == translations[i].toLowerCase()) {
                    console.log("found match for: " + userinput);
                    nextButton.click()
                }
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
            console.log('Pressed "Make Harder" button!');
            difficultyButton.click();
        }
    }
    // delay to avoid picking up the previous challenge through transition animations
    setTimeout(function() {
        // get prompt from hint tokens
        const sentenceTokenNodes = document.querySelectorAll('[data-test="hint-token"]');
        var sentence = "";
        for (var i = 0; i < sentenceTokenNodes.length; i++) {
            sentence = sentence.concat(sentenceTokenNodes[i].textContent);
        }
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
    console.log("getting translations");
    translations = [];
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
};
function extractTranslations(challenge, prompt) {
    if (challenge.prompt == prompt) {
        //TODO: properly parse compact translations: "[Ja/Jo], jag vill stanna [kvar/].", "[Far/Pappa/Min far/Min pappa] är stark som en viking."
        if (Object.hasOwn(challenge, "compactTranslations")) {
            translations = translations.concat(challenge.compactTranslations);
        }
        if (translations.length = 0) {
            // if the other properties don't exist for this challenge, usually the below is available
            console.log("Unable to extract translations!");
            console.log(challenge);
        }
        console.log(translations);
    }
}