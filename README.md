# Currency Scanner
## Computational Vision Final Project
### [✰ LINK TO PROJECT SITE](https://zaarafa.github.io/Currency-Scanner/)
### [✰ LINK TO GITHUB REPO](https://github.com/ZaarafA/Currency-Scanner)
![Example Use Image 1](https://i.imgur.com/ssMZHuL.png)

### How to Use:
- Open the Project Website linked above ( Test images are on the Github Repo )
- Wait for a second to allow OpenCV and the templates to load in
- Click on "Select Input Image" and choose an image file to process
- Once the image is loaded, click "PROCESS BILLS" to see the output. Processing might take a moment depending on how many bills are in the scene.

Note: If "Select Input Image" still remains grey after a few seconds, refresh the page. Additionally, Bringing up the Browser Console provides more information about the image processing.  

*** Running this from the website is recommended. Due to browser security settings, if you want to run this locally, you'd have to run it from a local HTTPS web server.

### Motivation:
The brick and mortar shopping experience is being increasingly digitized, tap to pay, card, chip, partly in the name of speeding up the transaction. A vision system could address the speed bottleneck that cash payments present, by identifying the types and values of bills in an image. This could also be used for Asset Protection to ensure the amount of money passing through a counter matches the amount that ended up in the register.

### Technical Approach:
- Made in Javascript using OpenCV.js
- On load, Keypoints and Descriptors are extracted from the template images using ORB
- When a file is selected, the image bills are located:
  - Preprocessing: Grayscale, Gaussian blur
  - Edge Detection and Amplification: using Canny and Dilation
  - Intersection over Union and NonMax Suppression are used to filter (most) overlapping rectangles
  - A bounding box is drawn over potential bills
- Using those boundaries, bills are identified
  - The keypoints/descriptors are extracted from each bill region
  - Those keypoints are matched using BruteForce Matcher against each template in turn
  - The matches are filtered by distance, and the template with the most good matches is kept
  - A label is written over each region with the most likely bill
- Using the list of bills identified, the total value is summed and a labelled image is displayed

### Limitations:
- Accuracy: From testing, there's a 95% accuracy rate under ideal conditions. It infrequently produces a memory error when processing images, likely because the loading being incomplete. The program handles those errors by simply refreshing the page.
- Finding Coins: I got it mostly working but the fine grain details made me remove it in the final version. While it worked perfectly for simple images of coins, it became exponentially slower and less reliable the more elements added to the image. I decided it was more important to do one thing perfectly than many things just alright.
- Occlusion/Overlap: Occluded bills aren't counted. The classification function *can* identify them, however I only look in a bounded box around rectangular bills.
- Skew: The program can handle only up to ~30° of camera or image tilt.


### Images:
![Example Use Image 2](https://i.imgur.com/YIjO8CU.png)
![Example Use Image 3](https://i.imgur.com/JFwmMs2.png)
### [Usage Video](https://youtu.be/asrFWLCDb6o):
![Usage Gif](https://i.imgur.com/JLod8dp.gif)