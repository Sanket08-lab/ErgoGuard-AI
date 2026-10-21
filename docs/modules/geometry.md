## Summary (ErgoGuard)

- **What it is:** four small calculators that turn AI points and boxes into numbers the safety rules use.
- **`angleAt`:** how bent a joint is. We use it for knee angle (straight knees while bending = unsafe lifting).
- **`angleFromVertical`:** how far a body line leans from upright. 0° = standing, 90° = lying flat. Used for posture and fall detection.
- **`iou`:** how much two boxes overlap. Used to match the same person from one frame to the next.
- **`ioa`:** how much of a small box sits inside a bigger one. Used for PPE: is the hardhat box inside the head area?
- **Why `ioa`, not `iou`, for PPE:** a hardhat is tiny next to a person box, so `iou` stays low even when worn.
- **Known limits:** angles come from a 2D camera view, so leaning toward the camera is hard to see. Results depend on the AI's detection quality.
- **Test:** `node tests/geometry.test.js`

# Geometry Module (`engine/geometry.js`)

The `geometry.js` module provides foundational, zero-dependency geometric calculations for ErgoGuard-AI. It powers real-time posture analysis, skeletal joint angle evaluations, and bounding box spatial overlap metrics for computer vision detections.

All functions are implemented as pure JavaScript ES modules with robust handling for 2D/3D coordinates and various bounding box schemas.

---

## Core Functions

### 1. `angleAt(a, b, c)`

> **Definition:** Computes joint angle in degrees at vertex `b` formed by rays `ba` and `bc` for ergonomic posture tracking.

#### Overview & Behavior
`angleAt` measures the interior angle formed between three sequential keypoints, with `b` acting as the pivot or vertex. In ergonomic posture tracking, this is typically used to measure joint articulation angles—such as elbow flexion (`shoulder` -> `elbow` -> `wrist`), knee flexion (`hip` -> `knee` -> `ankle`), or spinal/hip bending (`shoulder` -> `hip` -> `knee`).

The function computes direction vectors $\vec{v_1} = a - b$ and $\vec{v_2} = c - b$, determines their dot product and Euclidean norms, and resolves the angle via the arc cosine:

$$\theta = \arccos\left(\text{clamp}\left(\frac{\vec{v_1} \cdot \vec{v_2}}{\|\vec{v_1}\| \|\vec{v_2}\|}, -1, 1\right)\right) \times \frac{180}{\pi}$$

#### Parameters
* **`a`** (`Point`): First endpoint coordinate.
* **`b`** (`Point`): Vertex/hinge coordinate.
* **`c`** (`Point`): Second endpoint coordinate.

*Supported Point representations:*
* Objects: `{ x, y }` or `{ x, y, z }`
* Arrays: `[x, y]` or `[x, y, z]`

#### Returns
* `number`: The calculated angle in degrees between `0` and `180`. Returns `0` if either segment has zero length (degenerate points).

#### Example
```javascript
import { angleAt } from '../engine/geometry.js';

// Right-angle joint flexion (e.g., 90-degree elbow bend)
const shoulder = { x: 0, y: 10 };
const elbow = { x: 0, y: 0 };
const wrist = { x: 10, y: 0 };

const elbowAngle = angleAt(shoulder, elbow, wrist);
console.log(elbowAngle); // 90
```

---

### 2. `angleFromVertical(a, b)`

> **Definition:** Computes inclination angle in degrees of a segment or vector relative to the vertical axis.

#### Overview & Behavior
`angleFromVertical` assesses body lean, slouching, and ergonomic misalignment by evaluating how far a body segment deviates from upright posture ($0^\circ$). It is commonly applied to track neck tilt (forward head posture between mid-shoulder and ear) and trunk/torso inclination (hip to shoulder).

The function supports two usage patterns:
1. Two points representing a directed segment `(a, b)`.
2. A single vector or delta object `(a)` where displacement is relative to the origin.

It extracts the horizontal displacement in the $X$/$Z$ plane ($\sqrt{\Delta x^2 + \Delta z^2}$) and the absolute vertical displacement along the $Y$ axis ($|\Delta y|$), then computes:

$$\theta = \arctan2(\text{dist}_{\text{horizontal}}, \text{dist}_{\text{vertical}}) \times \frac{180}{\pi}$$

Because it considers absolute vertical displacement, the calculation is invariant to the ordering of points (e.g. passing `hip` to `shoulder` yields the exact same angle as `shoulder` to `hip`).

#### Parameters
* **`a`** (`Point`): Starting point or single displacement vector (`{ x, y, z? }` or `[x, y, z?]`).
* **`b`** (`Point`, *optional*): Ending point (`{ x, y, z? }` or `[x, y, z?]`).

#### Returns
* `number`: The tilt angle in degrees between `0` (strictly upright/vertical) and `90` (completely horizontal). Returns `0` for zero-length segments.

#### Example
```javascript
import { angleFromVertical } from '../engine/geometry.js';

// Measuring trunk inclination from hip to shoulder
const hip = { x: 100, y: 300 };
const shoulder = { x: 130, y: 150 }; // tilted forward in X

const trunkTilt = angleFromVertical(hip, shoulder);
console.log(trunkTilt); // ~11.3 degrees from vertical
```

---

### 3. `iou(a, b)`

> **Definition:** Calculates Intersection over Union between two bounding boxes for overlap evaluation and NMS.

#### Overview & Behavior
`iou` (Intersection over Union) is a standard symmetric metric for comparing two bounding boxes. It quantifies how closely two bounding regions coincide relative to their total combined area:

$$\text{IoU}(A, B) = \frac{\text{Area}(A \cap B)}{\text{Area}(A \cup B)} = \frac{\text{Area}(A \cap B)}{\text{Area}(A) + \text{Area}(B) - \text{Area}(A \cap B)}$$

In ErgoGuard-AI, `iou` is essential for:
* Non-Maximum Suppression (NMS) to eliminate duplicate detections of the same individual.
* Temporal tracking and object association across consecutive video frames.

The function automatically normalizes multiple bounding box formats, handles arbitrary coordinate orderings, and guards against negative or non-overlapping regions.

#### Parameters
* **`a`** (`BoundingBox`): First bounding box.
* **`b`** (`BoundingBox`): Second bounding box.

*Supported Bounding Box schemas:*
* Standard standard format: `{ x, y, width, height }` (or `{ x, y, w, h }`)
* Extents format: `{ xmin, ymin, xmax, ymax }`
* Pascal VOC / Min-Max format: `{ minX, minY, maxX, maxY }`
* CSS / Boundary format: `{ left, top, right, bottom }`
* Array format: `[xmin, ymin, xmax, ymax]`

#### Returns
* `number`: Overlap score between `0.0` (no overlap) and `1.0` (perfectly identical boxes). Returns `0` if union area is zero.

#### Example
```javascript
import { iou } from '../engine/geometry.js';

const box1 = { x: 0, y: 0, width: 100, height: 100 };
const box2 = { x: 50, y: 0, width: 100, height: 100 };

// 50% horizontal overlap -> intersection = 5000, union = 15000
console.log(iou(box1, box2)); // 0.3333333333333333 (1/3)
```

---

### 4. `ioa(a, b)`

> **Definition:** Calculates Intersection over Area of box a covered by box b for containment and occlusion analysis.

#### Overview & Behavior
`ioa` (Intersection over Area) is an asymmetric coverage metric that calculates the proportion of reference box `a` that falls within the boundary of target box `b`:

$$\text{IoA}(a, b) = \frac{\text{Area}(a \cap b)}{\text{Area}(a)}$$

Unlike `iou`, `ioa` is directional:
* `ioa(a, b)` evaluates how much of box `a` is covered by box `b`.
* If a small box `a` is completely inside a large box `b`, `ioa(a, b)` is `1.0` (100% containment), while `iou(a, b)` would only be a fraction.

In ErgoGuard-AI, `ioa` is used for:
* Analyzing partial or total occlusion of body parts or equipment.
* Detecting containment within predefined safety zones or designated ergonomic workstations.

#### Parameters
* **`a`** (`BoundingBox`): Reference box whose covered fraction is being evaluated.
* **`b`** (`BoundingBox`): Overlapping target box.

*(Accepts all bounding box representations supported by `iou`.)*

#### Returns
* `number`: Coverage ratio between `0.0` (no intersection) and `1.0` (box `a` is completely covered by box `b`). Returns `0` if the area of box `a` is zero.

#### Example
```javascript
import { ioa } from '../engine/geometry.js';

const workstationZone = { xmin: 0, ymin: 0, xmax: 500, ymax: 500 };
const workerBox = { xmin: 100, ymin: 100, xmax: 200, ymax: 300 };

// Worker box is completely contained inside the workstation zone:
console.log(ioa(workerBox, workstationZone)); // 1.0 (100% enclosed)

// Fraction of workstation zone occupied by the worker:
console.log(ioa(workstationZone, workerBox)); // 0.08 (8% coverage)
```

---

## Internal Normalization & Helpers

To maintain flexibility and prevent errors across varying computer vision pipelines, `geometry.js` includes internal normalization helpers:

1. **`toPoint(p)`**: Normalizes both `[x, y, z]` arrays and `{ x, y, z }` point objects into a uniform coordinate structure.
2. **`toBoxCoords(box)`**: Unifies `[x1, y1, x2, y2]`, `{ x, y, width, height }`, `{ minX, minY, maxX, maxY }`, and `{ left, top, right, bottom }` representations into an explicit coordinate quad `[xmin, ymin, xmax, ymax]`.
3. **`boxIntersectionAndAreas(a, b)`**: Computes intersection rectangle dimensions, clipped intersection area, and the individual surface areas of both boxes with protections against inverted coordinates.

---

## Edge Case Handling & Numerical Safeguards

* **Floating-Point Clamping:** Trigonometric inputs for `Math.acos` are clamped to $[-1, 1]$ to prevent `NaN` values resulting from micro floating-point inaccuracies.
* **Zero-Magnitude Vectors:** Collinear or coincident points where vector length is zero safely return `0` instead of `NaN` or throwing division-by-zero errors.
* **Coordinate Inversion Resilience:** Bounding box calculations use `Math.min` and `Math.max` across endpoints, ensuring valid area calculations even when coordinates are inverted (e.g., $x_{\text{min}} > x_{\text{max}}$).
* **Zero-Area Geometries:** Zero-width or zero-height bounding boxes yield `0` for both IoU and IoA without uncaught exceptions.
