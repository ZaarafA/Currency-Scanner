# Currency Scanner
## Computational Vision Final Project

### How to Use:
- Wait for a second to allow OpenCV to load
- Click on "Select Input Image" and choose an image file to process
- After a moment, the program should output a labelled image and update the $Total
- Note: Bringing up the Browser Console provides more information on the process

### Motivation:
The brick and mortar shopping experience is being increasingly digitized, tap to pay, card, chip, partly in the name of speeding up the transaction. A vision system could address the speed bottleneck that cash payments present, by identifying the types and values of bills in an image. This could also be used for Asset Protection to ensure the amount of money passing through a counter matches the amount that ended up in the register.

### Technical Approach:
- Made in Javascript using OpenCV.js
- On load, Keypoints and Descriptors are extracted from the template images using ORB
- When a file is selected, the image bills are located:
  - Preprocessing: Grayscale, Gaussian blur
  - Edge Detection and Amplification: using Canny and Dilation
  - Non-overlapping Rectangular countours, that match a bill's aspect ratio, are picked out
  - A bounding box is drawn over potential bills
- Using those boundaries, bills are identified
  - The keypoints/descriptors are extracted from each bill region
  - Those keypoints are matched using BruteForce Matcher against each template in turn
  - The matches are filtered by distance, and the template with the most good matches is kept
  - A label is written over each region with the most likely bill
- Using the list of bills identified, the total value is summed and a labelled image is displayed

### Limitations:
- Trying to Find Coins in an image that has no coins is *really* slow. As such, it's not done by default. The function doesn't handle a mixture of bills and coins very well because of the false positives, such as the emblem on every dollar.
- Occlusion/Overlap: Occluded bills aren't counted. The classification function can identify them, however I only look in a bounded box around rectangular bills.
- Skew: The program can handle only up to ~30° of camera or image tilt.

### Images: