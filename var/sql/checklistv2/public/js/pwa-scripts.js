window.addEventListener("pageshow", function (event) {
    if (event.persisted) {
        document.querySelector("#flashAlertsContainer").classList.add("d-none");
    }

    console.log(event.persisted);
});
