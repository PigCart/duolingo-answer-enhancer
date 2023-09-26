const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    let response = await originalFetch(resource, config);
    if (response.clone().url == "https://www.duolingo.com/2017-06-30/sessions") {
        // might want to wildcard out the date with regex or something
        let json = await response.clone().json();
        document.dispatchEvent(new CustomEvent("fetchSessions", { detail: json }));
    }
    return response;
};