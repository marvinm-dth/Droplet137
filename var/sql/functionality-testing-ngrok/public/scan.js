let scanBuffer = "";
let lastScanTime = 0;
const scanThreshold = 50;
document.addEventListener("keydown", (event) => {
    const currentTime = new Date().getTime();
    if (currentTime - lastScanTime > scanThreshold) {
        scanBuffer = "";
    }
    if (event.key === "Enter") {
        if (scanBuffer.length > 3) {
            const scanEvent  = new CustomEvent("scan_detect", { detail: {value: scanBuffer}});
            document.dispatchEvent(scanEvent)
        }
        scanBuffer = "";
    } else {
        scanBuffer += event.key;
    }
    lastScanTime = currentTime;
});