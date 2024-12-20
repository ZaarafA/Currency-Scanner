// GLOBAL VARIABLES
const color_green = new cv.Scalar(35, 255, 15, 255);
const color_red = new cv.Scalar(255, 15, 15, 255);
const ratio_tolerance = 1.0;
let src_image = null;
let dst_image = null;
let templatesData = []; // name, keypoints, descriptors, rows, cols
let psConsole, total_el, counts_el;
let bills = [];

// On OpenCV Load
cv.onRuntimeInitialized = () => {
    console.log("OpenCV.js is ready.");
    processTemplates();
    document.getElementById('InputBtn').disabled = false;
}
// On HTML Load
document.addEventListener("DOMContentLoaded", () => {
    psConsole = document.getElementById("psconsole");
    total_el = document.getElementById("total");
    counts_el = document.getElementById("counts");
});

// Take in an input image, load it to the screen and save it to src_image as a Mat object
function loadInputImage(event){
    bills = [];
    psConsole.innerHTML = '';
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        // read image file and load it into imgElement
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgElement = document.createElement('img');
            imgElement.src = e.target.result;
            imgElement.style.maxWidth = '100%';
            imgElement.style.maxHeight = '100%';
            
            // show imgElement in InputImage section
            imgElement.onload = () => {
                const inputImageDiv = document.querySelector('.inputImageDiv');
                inputImageDiv.innerHTML = '';
                inputImageDiv.appendChild(imgElement);
                src_image = cv.imread(imgElement);
                dst_image = src_image.clone();

                // ======== Process Image ========
                // processImage();
            };
        };
        reader.readAsDataURL(file);
        psConsoleLog("LOADING...");
        document.getElementById("findCoins").disabled = false;
        document.getElementById("processBtn").disabled = false;
    } else {
        alert('Please select an image.');
    }
}

// Load Templates, Extract Keypoints and Descriptors, Fill out templatesData 
function processTemplates(){
    console.log("Template Processing Started");
    let templatesMat = []; // grayscale template mats
    let templatesEl = ["1_imgEl","5_imgEl","10_imgEl","20_imgEl","50_imgEl","100_imgEl"];
    let orb = new cv.ORB(1500);

    // for each template, load the keypoints into an array of template objects
    templatesEl.forEach(item => {
        // read and convert to grayscale
        let temp = cv.imread(item);
        cv.cvtColor(temp, temp, cv.COLOR_RGBA2GRAY);
        templatesMat.push(temp);
        console.log(`Template Loaded: ${item}`);

        // extract keypoints and descriptors
        let keypointsTemplate = new cv.KeyPointVector();
        let descriptorsTemplate = new cv.Mat();
        orb.detectAndCompute(temp, new cv.Mat(), keypointsTemplate, descriptorsTemplate);

        templatesData.push({
            name: item,
            keypoints: keypointsTemplate,
            descriptors: descriptorsTemplate,
            rows: temp.rows,
            cols: temp.cols
        });

        temp.delete();
    });
    psConsoleLog(`Templates Loaded`);
    orb.delete();
}

// takes image, returns bounding boxes, post: draws them over dst_image
function detectBills(image) {
    let resultMat = image.clone();
    let temp = new cv.Mat();

    // ======= Preprocess Image =======
    cv.cvtColor(image, temp, cv.COLOR_RGBA2GRAY); // grayscale
    cv.GaussianBlur(temp, temp, new cv.Size(5, 5), 0); // blur
    cv.Canny(temp, temp, 50, 150); // edge detection

    let kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(temp, temp, kernel); // dilate to boost edges

    // find contours
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(temp, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // ======= Bounding Boxes =======
    // for each contour, create a bounding box and validate it
    let boundingBoxes = [];
    for(let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        let rect = cv.boundingRect(contour);

        // Match aspect ratio with a dollar bill
        let aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
        if (aspectRatio >= 2.5 - ratio_tolerance && aspectRatio <= 2.5 + ratio_tolerance && rect.width > 50 && rect.height > 50) {
            boundingBoxes.push(rect);
        }
    }
    // fix overlapping boxes -> there's probably a better way to do this but this works enough
    let finalBoxes = [];
    for(let i = 0; i < boundingBoxes.length; i++){
        let keep = true;
        // Check if box i is inside box j -> push the ones that are fine
        for(let j = 0; j < boundingBoxes.length; j++) {
            if (i === j){ continue; }
            if (
                boundingBoxes[i].x >= boundingBoxes[j].x && boundingBoxes[i].y >= boundingBoxes[j].y &&
                boundingBoxes[i].x + boundingBoxes[i].width <= boundingBoxes[j].x + boundingBoxes[j].width &&
                boundingBoxes[i].y + boundingBoxes[i].height <= boundingBoxes[j].y + boundingBoxes[j].height
            ) {
                keep = false;
                break;
            }
        } if (keep){
            finalBoxes.push(boundingBoxes[i]);
        }
    }

    // Draw bounding boxes
    for (let box of finalBoxes) {
        cv.rectangle(resultMat,new cv.Point(box.x, box.y),new cv.Point(box.x + box.width, box.y + box.height),color_green,2);
    }

    temp.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();

    psConsoleLog(`FOUND ${finalBoxes.length} BILLS`);
    dst_image = resultMat.clone();
    return finalBoxes;
}

// Given an array of bill locations, find which template matches the bill, and label each 
function processBills(boundingBoxes) {
    let orb = new cv.ORB(1000);
    let bfMatcher = new cv.BFMatcher(cv.NORM_HAMMING, true);

    // for each region, extract and match keypoints against each template
    boundingBoxes.forEach(box => {
        let leadingTemplate = [null, 0];
        let roi = src_image.roi(new cv.Rect(box.x, box.y, box.width, box.height));
        let keypointsROI = new cv.KeyPointVector();
        let descriptorsROI = new cv.Mat();
        orb.detectAndCompute(roi, new cv.Mat(), keypointsROI, descriptorsROI);

        // ======= Template Matching =======
        // match Descriptions btwn Input and every Template. Filter for only matches above a threshold
        templatesData.forEach((template) => {
            let matches = new cv.DMatchVector();
            bfMatcher.match(descriptorsROI, template.descriptors, matches);

            let filteredMatches = [];
            for (let i = 0; i < matches.size(); i++) {
                let match = matches.get(i);
                if (match.distance < 50) {
                    filteredMatches.push(match);
                }
            }
            if (filteredMatches.length > leadingTemplate[1]) {
                leadingTemplate = [template.name, filteredMatches.length];
            }

            matches.delete();
        });

        if (leadingTemplate[0] !== null) {
            psConsoleLog(`Bill at (${box.x}, ${box.y}) matched: ${leadingTemplate[0]} with ${leadingTemplate[1]} matches`);
            bills.push(parseInt(leadingTemplate[0].replace('_imgEl','')));

            // label bill with prediction
            let txt_position = new cv.Point(box.x + 10, box.y + 20);
            let txt_label = leadingTemplate[0].replace('_imgEl', ' Dollar Bill'); 
            cv.putText(dst_image, txt_label, txt_position, cv.FONT_HERSHEY_DUPLEX, 0.75, new cv.Scalar(0, 0, 0, 255), 3);
            cv.putText(dst_image, txt_label, txt_position, cv.FONT_HERSHEY_DUPLEX, 0.75, new cv.Scalar(255, 255, 255, 255), 1);
        } else {
            console.log(`Bill at (${box.x}, ${box.y}) had no matches`);
        }

        roi.delete();
        keypointsROI.delete();
        descriptorsROI.delete();
    });
    orb.delete();
    bfMatcher.delete();

    calculateTotal();
}

// Display dst_image to Output Image Panel
function displayOutput(){
    const outputImageDiv = document.querySelector('.outputImageDiv');
    outputImageDiv.innerHTML = '';
    const canvas = document.createElement('canvas');
    canvas.width = dst_image.cols;
    canvas.height = dst_image.rows;
    outputImageDiv.appendChild(canvas);
    cv.imshow(canvas, dst_image);
}

// Sum the bills found in image and write to the screen
function calculateTotal(){
    let total = bills.reduce((a,b) => a + b, 0); // sum array
    // write total and list to panel
    total_el.innerHTML = `Total: $${total}.00`;
    counts_el.innerHTML = '';
    bills.forEach(bill => counts_el.innerHTML += `$${bill} Bill, `);
}

// Pseudo-Console Log: Displaying Console Logs on screen just for easier visibility
function psConsoleLog(text){
    console.log(text);
    psConsole.innerHTML += `- ${text}<br>`;
}

function test() {
    const imgElement = document.createElement('img');
    imgElement.src = '20241208_003528.jpg';
    imgElement.style.maxWidth = '100%';
    imgElement.style.maxHeight = '100%';

    imgElement.onload = () => {
        const inputImageDiv = document.querySelector('.inputImageDiv');
        inputImageDiv.innerHTML = '';
        inputImageDiv.appendChild(imgElement);

        let temp = cv.imread(imgElement);
        dst_image = temp.clone();
        findCoins(temp);

        const outputImageDiv = document.querySelector('.outputImageDiv');
        outputImageDiv.innerHTML = '';
        const canvas = document.createElement('canvas');
        canvas.width = dst_image.cols;
        canvas.height = dst_image.rows;
        outputImageDiv.appendChild(canvas);
        cv.imshow(canvas, dst_image);

        temp.delete();
        dst_image.delete();
    };
}

// Coins the number of circles in the scene -> Really Slow
function findCoins(src){
    psConsoleLog("Detecting Coins");
    // preprocess
    let temp = src.clone();
    cv.cvtColor(temp, temp, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(temp, temp, new cv.Size(9, 9), 2, 2);
    // find circles
    let circles = new cv.Mat();
    cv.HoughCircles(temp, circles, cv.HOUGH_GRADIENT, 1, 30, 150, 20, 10, temp.rows/3);

    if(circles.cols == 0){
        psConsoleLog("No Coins Found");
        temp.delete();
        circles.delete();
        return;
    }
    // store the coins centre and radius. Return if it struggles and finds > 50
    let coinPositions = []; // (x, y, r)
    for (let i = 0; i < circles.cols; i++) {
        let x = circles.data32F[i * 3];
        let y = circles.data32F[i * 3 + 1];
        let r = circles.data32F[i * 3 + 2];

        coinPositions.push({ x: x, y: y, r: r });
        if(coinPositions.length > 50){
            psConsoleLog("No Valid Coins found");
            temp.delete();
            circles.delete();
            return;
        }
    }
    // draw coin on dst_image
    for (let coin of coinPositions) {
        cv.circle(dst_image, new cv.Point(Math.round(coin.x), Math.round(coin.y)), Math.round(coin.r), color_green, 1.5);
    }
    counts_el.innerHTML += `<br> Found ${coinPositions.length} Coins`;
    psConsoleLog(`Found ${coinPositions.length} Coins`);
    temp.delete();
    circles.delete();
}
// Wrapper function for the Find Coins buttton
function findCoinsBtn(){
    psConsoleLog("Looking for COINS. Please Wait...");
    findCoins(src_image);
    displayOutput();
}
// Wrapper function for Process Image button
function processImage(){
    let bounding_boxes = detectBills(src_image);
    processBills(bounding_boxes);
    displayOutput();
}