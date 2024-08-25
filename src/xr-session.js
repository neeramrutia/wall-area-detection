import * as THREE from 'three';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let container, labelContainer;
let camera, scene, renderer, light;
let controller;

let hitTestSource = null;
let hitTestSourceRequested = false;

let measurements = [];
let labels = [];

let reticle;
let currentLine = null;

let width, height;

function toScreenPosition(point, camera)
{
  var vector = new THREE.Vector3();
  
  vector.copy(point);
  vector.project(camera);
  
  vector.x = (vector.x + 1) * width /2;
  vector.y = (-vector.y + 1) * height/2;
  vector.z = 0;

  return vector

};

function getCenterPoint(points) {
  let line = new THREE.Line3(...points)
  return line.getCenter();
}

function matrixToVector(matrix) {
  let vector = new THREE.Vector3();
  vector.setFromMatrixPosition(matrix);
  return vector;
}

function initLine(point) {
  let lineMaterial = new THREE.LineBasicMaterial({
    color: 0xffffff,
    linewidth: 5,
    linecap: 'round'
  });

  let lineGeometry = new THREE.BufferGeometry().setFromPoints([point, point]);
  return new THREE.Line(lineGeometry, lineMaterial);
}

function updateLine(matrix) {
  let positions = currentLine.geometry.attributes.position.array;
  positions[3] = matrix.elements[12]
  positions[4] = matrix.elements[13]
  positions[5] = matrix.elements[14]
  currentLine.geometry.attributes.position.needsUpdate = true;
  currentLine.geometry.computeBoundingSphere();
}

function initReticle() {
  let ring = new THREE.RingBufferGeometry(0.045, 0.05, 32).rotateX(- Math.PI / 2);
  let dot = new THREE.CircleBufferGeometry(0.005, 32).rotateX(- Math.PI / 2);
  reticle = new THREE.Mesh(
    BufferGeometryUtils.mergeBufferGeometries([ring, dot]),
    new THREE.MeshBasicMaterial()
  );
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
}

function initLabelContainer() {
  labelContainer = document.createElement('div');
  labelContainer.style.position = 'absolute';
  labelContainer.style.top = '0px';
  labelContainer.style.pointerEvents = 'none';
  labelContainer.setAttribute('id', 'container');
}

function initCamera() {
  camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 20);
}

function initLight() {
  light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  light.position.set(0.5, 1, 0.25);
}

function initScene() {
  scene = new THREE.Scene();
}

function getDistance(points) {
  if (points.length == 2)
    return points[0].distanceTo(points[1]);
}

function initXR() {
  container = document.createElement('div');
  document.body.appendChild(container);

  width = window.innerWidth;
  height = window.innerHeight;

  initScene();

  initCamera();

  initLight();
  scene.add(light);

  initRenderer()
  container.appendChild(renderer.domElement);

  initLabelContainer()
  container.appendChild(labelContainer);

  document.body.appendChild(ARButton.createButton(renderer, {
    optionalFeatures: ["dom-overlay"],
    domOverlay: {root: document.querySelector('#container')}, 
    requiredFeatures: ['hit-test']
  }));

  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  initReticle();
  scene.add(reticle);

  window.addEventListener('resize', onWindowResize, false);
  animate()
}

// function onSelect() {
//   if (reticle.visible) {
//     measurements.push(matrixToVector(reticle.matrix));
//     if (measurements.length == 2) {
//       let distance = Math.round(getDistance(measurements) * 100);

//       let text = document.createElement('div');
//       text.className = 'label';
//       text.style.color = 'rgb(255,255,255)';
//       text.textContent = distance + ' cm';
//       document.querySelector('#container').appendChild(text);

//       labels.push({div: text, point: getCenterPoint(measurements)});

//       measurements = [];
//       currentLine = null;
//     } else {
//       currentLine = initLine(measurements[0]);
//       scene.add(currentLine);
//     }
//   }
// }


let screenMeasurements = [];  // Add this line to store screen positions

function onSelect() {
  if (reticle.visible) {
    const point3D = matrixToVector(reticle.matrix);
    measurements.push(point3D);
    
    const screenPoint = toScreenPosition(point3D, renderer.xr.getCamera(camera));
    screenMeasurements.push(screenPoint);  // Store the screen position
    console.log("screen point : " , screenPoint);
    
    if (measurements.length == 2) {
      // Calculate the 3D distance
      let distance = Math.round(getDistance(measurements) * 100);
      let pixelDistance = 0;

      // Display the 3D distance in cm
      let text = document.createElement('div');
      text.className = 'label';
      text.style.color = 'rgb(255,255,255)';
      text.textContent = `${distance} cm, ${pixelDistance} px`;  // Display both distances
      document.querySelector('#container').appendChild(text);

      
      labels.push({ div: text, point: getCenterPoint(measurements) });
      // Reset measurements
      measurements = [];
      screenMeasurements = [];  // Reset screen measurements
      currentLine = null;
    } else {
      currentLine = initLine(measurements[0]);
      scene.add(currentLine);
    }
  }
}


function onWindowResize() {
  width = window.innerWidth;
  height = window.innerHeight;
  camera.aspect = width/height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(timestamp, frame) {
  if (frame) {
    let referenceSpace = renderer.xr.getReferenceSpace();
    let session = renderer.xr.getSession();
    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace('viewer').then(function (referenceSpace) {
        session.requestHitTestSource({ space: referenceSpace }).then(function (source) {
          hitTestSource = source;
        });
      });
      session.addEventListener('end', function () {
        hitTestSourceRequested = false;
        hitTestSource = null;
      });
      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      let hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length) {
        let hit = hitTestResults[0];
        reticle.visible = true;
        reticle.matrix.fromArray(hit.getPose(referenceSpace).transform.matrix);
      } else {
        reticle.visible = false;
      }

      if (currentLine) {
        updateLine(reticle.matrix);
      }
    }

    labels.map((label) => {
      let pos = toScreenPosition(label.point, renderer.xr.getCamera(camera));
      let x = pos.x;
      let y = pos.y;
      label.div.style.transform = "translate(-50%, -50%) translate(" + x + "px," + y + "px)";
    })
    if(labels[0]!=undefined && labels[1]!=undefined){
      let pos = toScreenPosition(labels[0].point, renderer.xr.getCamera(camera));
    let x = pos.x;
    let y = pos.y;
    let pos1 = toScreenPosition(labels[1].point, renderer.xr.getCamera(camera));
    let x1 = pos1.x;
    let y1 = pos1.y;
    pixelDistance = Math.round(Math.sqrt(
      Math.pow(x - x1, 2) +
      Math.pow(y - y1, 2)))
    }
    let text = document.getElementsByClassName("label");
    text.textContent = text.textContent + pixelDistance

  }
  renderer.render(scene, camera);
}

export { initXR }