const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    let response = await originalFetch(resource, config);
    if (response.url == "https://www.duolingo.com/2017-06-30/sessions") {
        // might want to wildcard out the date with regex or something
        var data = {
            json: response.clone().json()
        };
        document.dispatchEvent(new CustomEvent("fetchSessions", { detail: data }));
    }
    return response;
};