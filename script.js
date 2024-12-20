// ======= GLOBAL VARIABLES ======
const color_green = new cv.Scalar(35, 255, 15, 255);
const color_red = new cv.Scalar(255, 15, 15, 255);

const ratio_tolerance = 1.0;
const distance_tolerance = 50;
const match_tolerance = 15;

let src_image = null;
let dst_image = null;
let templatesData = []; // name, keypoints, descriptors, rows, cols
let psConsole, total_el, counts_el;
let bills = [];

// ======= Set Up =======
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
            const inputImageDiv = document.querySelector('.inputImageDiv');
            inputImageDiv.innerHTML = '';
            const imgElement = document.createElement('img');
            imgElement.src = e.target.result;
            imgElement.style.maxWidth = '100%';
            imgElement.style.maxHeight = '100%';
            inputImageDiv.appendChild(imgElement);
        
            // load image from file directly then into a Mat from canvas
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                src_image = cv.imread(canvas);
                dst_image = src_image.clone(); 
            };
        };
        
        reader.readAsDataURL(file);
        psConsoleLog("Input Image Loaded.");
        document.getElementById("processBtn").disabled = false;
    } else {
        alert('Please select an image.');
    }
}

// ============== Processing ==============
// Load Templates, Extract Keypoints and Descriptors, Fill out templatesData 
function processTemplates(){
    console.log("Template Processing Started");
    let templatesEl = ["1_imgEl","5_imgEl","10_imgEl","20_imgEl","50_imgEl","100_imgEl"];
    let orb = new cv.ORB(1000);

    // for each template, load the keypoints into an array of template objects
    templatesEl.forEach(item => {
        // read and convert to grayscale
        let temp = cv.imread(item);
        cv.cvtColor(temp, temp, cv.COLOR_RGBA2GRAY);
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

// takes image, returns bounding boxes, @post: draws them over dst_image
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

        // Match aspect ratio with a dollar bill's. Discard really small matches
        let aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
        if (aspectRatio >= 2.5 - ratio_tolerance && aspectRatio <= 2.5 + ratio_tolerance && rect.width > 100 && rect.height > 100) {
            boundingBoxes.push(rect);
        }
    }
    // fix overlapping boxes with nms
    let finalBoxes = nonMaxSuppression(boundingBoxes, 0.5);

    // Draw bounding boxes
    for (let box of finalBoxes) {
        cv.rectangle(resultMat,new cv.Point(box.x, box.y),new cv.Point(box.x + box.width, box.y + box.height),color_green,12);
    }

    temp.delete();
    contours.delete();
    hierarchy.delete();
    kernel.delete();

    psConsoleLog(`FOUND ${finalBoxes.length} BILLS`);
    dst_image = resultMat.clone();
    resultMat.delete();
    return finalBoxes;
}

// Given an array of bill locations, find which template matches the bill, and label each 
function processBills(boundingBoxes) {
    bills = [];
    
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
                if (match.distance < distance_tolerance) {
                    filteredMatches.push(match);
                }
            }
            if (filteredMatches.length > leadingTemplate[1]) {
                leadingTemplate = [template.name, filteredMatches.length];
            }

            matches.delete();
        });
        // discard bills with too few good matches
        if(leadingTemplate[1] < match_tolerance){
            leadingTemplate[0] = null;
        }

        // ======= Label and Store Bill =======
        if (leadingTemplate[0] !== null) {
            psConsoleLog(`Bill at (${box.x}, ${box.y}) matched: ${leadingTemplate[0]} w/ ${leadingTemplate[1]} matches`);
            bills.push(parseInt(leadingTemplate[0].replace('_imgEl','')));

            // label bill with prediction
            let txt_position = new cv.Point(box.x+20, box.y+60);
            let txt_label = leadingTemplate[0].replace('_imgEl', ' Dollar Bill'); 
            cv.putText(dst_image, txt_label, txt_position, cv.FONT_HERSHEY_DUPLEX, 3, new cv.Scalar(0, 0, 0, 255), 18);
            cv.putText(dst_image, txt_label, txt_position, cv.FONT_HERSHEY_DUPLEX, 3, new cv.Scalar(255, 255, 255, 255), 5);
        } else {
            psConsoleLog(`Bill at (${box.x}, ${box.y}) discarded`);
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

// ============== Helper Functions ==============
// Pseudo-Console Log: Displaying Console Logs on screen just for easier visibility
function psConsoleLog(text){
    console.log(text);
    psConsole.innerHTML += `- ${text}<br>`;
}

// Wrapper function for Process Image button
function processImage(){
    psConsoleLog("PROCESSING...PLEASE WAIT...");
    if(!src_image){
        psConsoleLog("NO SOURCE IMAGE");
        return;
    }
    // if there's an error in processing, refresh the page
    try{
        let bounding_boxes = detectBills(src_image);
        processBills(bounding_boxes);
        displayOutput();
    } catch (error) {
        console.error("Error in Processing: ", error);
        alert("ERROR: Please Try Again.");
        location.reload();
    }
    
}

// Intersection over Union of two boxes
// how much of the relative area of two boxes overlap
function iou(boxA, boxB){
    // coordinates of the intersection
    let xA = Math.max(boxA.x, boxB.x);
    let yA = Math.max(boxA.y, boxB.y);
    let xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    let yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    // intersection area
    let interWidth = Math.max(0, xB - xA);
    let interHeight = Math.max(0, yB - yA);
    let interArea = interWidth * interHeight;
    // overlap area
    let boxAArea = boxA.width * boxA.height;
    let boxBArea = boxB.width * boxB.height;

    let unionArea = boxAArea + boxBArea - interArea; // avoid double counting
    if (unionArea === 0){
        return 0;
    }
    return interArea / unionArea; // ratio of overlap
}
// NonMaxSuppression (opencv.js doesn't have this build in apparently)
// Get the largest boxes and check how much overlap there are betwn them
function nonMaxSuppression(boxes, iouThreshold = 0.5) {
    // sort by size cause a box can only fit inside a bigger box
    boxes.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    let finalBoxes = [];
    for (let i = 0; i < boxes.length; i++) {
        let currentBox = boxes[i];
        let keep = true;

        for (let j = 0; j < finalBoxes.length; j++) {
            let existingBox = finalBoxes[j];
            let iouValue = iou(currentBox, existingBox); // overlap

            // calculate intersection box coordinates 
            let xA = Math.max(currentBox.x, existingBox.x);
            let yA = Math.max(currentBox.y, existingBox.y);
            let xB = Math.min(currentBox.x + currentBox.width, existingBox.x + existingBox.width);
            let yB = Math.min(currentBox.y + currentBox.height, existingBox.y + existingBox.height);
            // intersection area
            let interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);

            let currentBoxArea = currentBox.width * currentBox.height;
            let existingBoxArea = existingBox.width * existingBox.height;

            // intersection ratio is too high or one box is fully inside the other
            if (iouValue > iouThreshold || interArea === currentBoxArea || interArea === existingBoxArea) {
                keep = false;
                break;
            }
        } if (keep) {
            finalBoxes.push(currentBox);
        }
    }

    return finalBoxes;
}