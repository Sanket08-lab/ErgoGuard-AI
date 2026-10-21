## Summary (ErgoGuard)

- **Job:** Decide if a detected person is missing mandatory safety gear (hardhat or high-visibility vest).
- **Target zones:** Slices the person box into head (top 28%) and torso (20% to 65% vertical span) areas.
- **Violation rule:** Flags a violation if no hardhat or vest box sits mostly inside its designated area (`ioa` ≥ 0.5).
- **Why `ioa`, not `iou`:** Gear boxes are tiny compared to person boxes, so `iou` remains low even when properly worn.
- **Skips:** Bypasses individuals under 120px tall because pixel resolution is too small to reliably judge.
- **Known limits (AI misses):** A hat or vest that the detection model fails to detect is treated as "no gear".
- **Known limits (frame edge):** A person cropped by the image boundary can produce clipped zones and false violations.
- **Test:** `node tests/ppe.test.js`
