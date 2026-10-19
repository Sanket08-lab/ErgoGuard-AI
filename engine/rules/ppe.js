import { ioa } from '../geometry.js';
import { CONFIG } from '../config.js';

// Validates that a confidence value is a finite numerical probability between 0 and 1.
function isValidConfidence(conf) {
  return typeof conf === 'number' && Number.isFinite(conf) && conf >= 0 && conf <= 1;
}

// Normalizes bounding box coordinates into [xmin, ymin, xmax, ymax] order while detecting zero-area boxes.
function parseBox(rawBox) {
  if (!rawBox) return null;
  const b = rawBox.bbox ?? rawBox.box ?? rawBox.bounding_box ?? rawBox;
  if (!b) return null;

  let xmin;
  let ymin;
  let xmax;
  let ymax;

  if (Array.isArray(b)) {
    if (b.length < 4) return null;
    [xmin, ymin, xmax, ymax] = b;
  } else if (typeof b === 'object') {
    if (b.x1 !== undefined && b.x2 !== undefined && b.y1 !== undefined && b.y2 !== undefined) {
      xmin = b.x1;
      ymin = b.y1;
      xmax = b.x2;
      ymax = b.y2;
    } else if (b.xmin !== undefined && b.xmax !== undefined && b.ymin !== undefined && b.ymax !== undefined) {
      xmin = b.xmin;
      ymin = b.ymin;
      xmax = b.xmax;
      ymax = b.ymax;
    } else if (b.minX !== undefined && b.maxX !== undefined && b.minY !== undefined && b.maxY !== undefined) {
      xmin = b.minX;
      ymin = b.minY;
      xmax = b.maxX;
      ymax = b.maxY;
    } else if (b.left !== undefined && b.right !== undefined && b.top !== undefined && b.bottom !== undefined) {
      xmin = b.left;
      ymin = b.top;
      xmax = b.right;
      ymax = b.bottom;
    } else if ((b.x !== undefined || b.left !== undefined) && (b.width !== undefined || b.w !== undefined)) {
      const x = b.x ?? b.left ?? 0;
      const y = b.y ?? b.top ?? 0;
      const w = b.width ?? b.w ?? 0;
      const h = b.height ?? b.h ?? 0;
      xmin = x;
      ymin = y;
      xmax = x + w;
      ymax = y + h;
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (
    typeof xmin !== 'number' || !Number.isFinite(xmin) ||
    typeof ymin !== 'number' || !Number.isFinite(ymin) ||
    typeof xmax !== 'number' || !Number.isFinite(xmax) ||
    typeof ymax !== 'number' || !Number.isFinite(ymax)
  ) {
    return null;
  }

  // Preserve reversed coordinates support by normalizing min and max
  const normXmin = Math.min(xmin, xmax);
  const normXmax = Math.max(xmin, xmax);
  const normYmin = Math.min(ymin, ymax);
  const normYmax = Math.max(ymin, ymax);

  const width = normXmax - normXmin;
  const height = normYmax - normYmin;

  return {
    box: [normXmin, normYmin, normXmax, normYmax],
    width,
    height,
    isZeroArea: width <= 0 || height <= 0,
  };
}

// Converts raw PPE detection candidates or nested PPE summary structures into a uniform list of candidates.
function normalizeDetections(items) {
  if (items == null) return null;

  if (Array.isArray(items)) {
    return items.map((item) => ({
      ...item,
      bbox: item.bbox ?? item.bounding_box ?? item.box ?? null,
    }));
  }

  if (typeof items === 'object') {
    const list = [];
    // Unwrap nested ppe object if caller passed a full worker detection object
    const ppeSource = items.ppe ?? items;

    const helmetSource = ppeSource.helmet ?? ppeSource.hardhat;
    if (helmetSource && typeof helmetSource === 'object') {
      list.push({
        type: 'hardhat',
        bbox: helmetSource.bbox ?? helmetSource.bounding_box ?? helmetSource.box ?? null,
        confidence: helmetSource.confidence,
        detected: helmetSource.detected,
      });
    }

    const vestSource = ppeSource.vest ?? ppeSource.safety_vest;
    if (vestSource && typeof vestSource === 'object') {
      list.push({
        type: 'vest',
        bbox: vestSource.bbox ?? vestSource.bounding_box ?? vestSource.box ?? null,
        confidence: vestSource.confidence,
        detected: vestSource.detected,
      });
    }

    return list;
  }

  return null;
}

// Determines if an item detection matches helmet/hardhat class nomenclature.
function isHardhatCandidate(item) {
  const label = String(item.type ?? item.label ?? item.class ?? item.name ?? '').toLowerCase();
  return (
    (label.includes('helmet') || label.includes('hardhat') || label.includes('hard-hat') || label === 'hat') &&
    !label.includes('no')
  );
}

// Determines if an item detection matches high-visibility safety vest class nomenclature.
function isVestCandidate(item) {
  const label = String(item.type ?? item.label ?? item.class ?? item.name ?? '').toLowerCase();
  return (
    (label.includes('vest') || label.includes('hi-vis') || label.includes('jacket')) &&
    !label.includes('no')
  );
}

// Evaluates PPE item candidates against expected anatomical region, IoA overlap, and detection confidence.
function evaluateItemCompliance(candidates, filterFn, expectedRegionBox, minIoA, minConf, itemLabel) {
  const matched = candidates.filter(filterFn);

  // If no candidates exist at all, this is a confirmed missing item
  if (matched.length === 0) {
    return {
      compliant: false,
      status: 'VIOLATION',
      evidenceDetails: {
        itemType: itemLabel,
        expectedRegion: expectedRegionBox,
        minIoA,
        minConfidence: minConf,
        bestCandidate: null,
        reason: `No ${itemLabel} candidate detected`,
      },
    };
  }

  let qualifyingCandidate = null;
  let uncertainCandidate = null;
  let bestCandidateSummary = null;

  for (const item of matched) {
    // Explicitly non-detected flag from pre-classified detection status
    if (item.detected === false) {
      continue;
    }

    const hasValidConfidence = isValidConfidence(item.confidence);
    const itemConf = hasValidConfidence ? item.confidence : null;

    // Check for pre-validated heuristic detection:
    // Exception: When an upstream heuristic detector pre-evaluates an anatomical crop and marks detected: true
    // without supplying a localized sub-bounding box, it qualifies if confidence meets the threshold.
    const isHeuristicCrop = item.detected === true && (item.bbox == null || item.bounding_box == null);
    if (isHeuristicCrop) {
      if (hasValidConfidence && itemConf >= minConf) {
        qualifyingCandidate = { isHeuristic: true, confidence: itemConf };
        break;
      } else {
        uncertainCandidate = {
          reason: !hasValidConfidence
            ? `${itemLabel} heuristic detection confidence is malformed (${item.confidence})`
            : `${itemLabel} heuristic detection confidence (${itemConf}) is below threshold (${minConf})`,
          confidence: itemConf ?? 0,
          candidate: item,
        };
        continue;
      }
    }

    // Standard detection requiring localized bounding box
    const parsed = parseBox(item.bbox);

    // Reject zero-area or missing bounding box
    if (!parsed || parsed.isZeroArea) {
      uncertainCandidate = {
        reason: !parsed
          ? `${itemLabel} candidate has malformed bounding box`
          : `${itemLabel} candidate has degenerate zero-area bounding box`,
        confidence: itemConf ?? 0,
        candidate: item,
      };
      continue;
    }

    if (!hasValidConfidence) {
      uncertainCandidate = {
        reason: `${itemLabel} candidate confidence is malformed (${item.confidence})`,
        confidence: 0,
        candidate: item,
      };
      continue;
    }

    // IoA denominator is area(itemBox), calculating proportion of PPE inside expected anatomic region
    const overlap = ioa(parsed.box, expectedRegionBox);
    const summary = {
      box: parsed.box,
      confidence: itemConf,
      ioa: overlap,
    };

    if (!bestCandidateSummary || overlap > bestCandidateSummary.ioa) {
      bestCandidateSummary = summary;
    }

    if (itemConf >= minConf && overlap >= minIoA) {
      qualifyingCandidate = summary;
      break;
    }

    // If candidate sufficiently overlaps expected region but has low confidence, it is UNCERTAIN
    if (overlap >= minIoA && itemConf < minConf) {
      uncertainCandidate = {
        reason: `${itemLabel} candidate confidence (${itemConf}) is below threshold (${minConf})`,
        confidence: itemConf,
        candidate: summary,
      };
    }
  }

  if (qualifyingCandidate) {
    return { compliant: true };
  }

  // If evidence was uncertain, report UNCERTAIN status rather than confirmed VIOLATION
  if (uncertainCandidate) {
    return {
      compliant: false,
      status: 'UNCERTAIN',
      evidenceDetails: {
        itemType: itemLabel,
        expectedRegion: expectedRegionBox,
        minIoA,
        minConfidence: minConf,
        bestCandidate: bestCandidateSummary ?? uncertainCandidate.candidate,
        reason: uncertainCandidate.reason,
      },
    };
  }

  // If candidates were completely disjoint / outside the target region, confirm VIOLATION
  return {
    compliant: false,
    status: 'VIOLATION',
    evidenceDetails: {
      itemType: itemLabel,
      expectedRegion: expectedRegionBox,
      minIoA,
      minConfidence: minConf,
      bestCandidate: bestCandidateSummary,
      reason: bestCandidateSummary
        ? `${itemLabel} candidate IoA overlap (${bestCandidateSummary.ioa.toFixed(3)}) below required threshold (${minIoA})`
        : `No ${itemLabel} detected in designated region`,
    },
  };
}

// Evaluates worker compliance for helmet and safety vest, returning structured results for any non-compliant state.
export function ppeRule(person, items, cfg) {
  // Validate presence of person input
  if (!person) {
    return [
      {
        status: 'INVALID',
        type: 'InvalidInput',
        confidence: 0,
        points: 0,
        evidence: { reason: 'Person input is null or undefined' },
      },
    ];
  }

  const rawCandidates = normalizeDetections(items);
  if (rawCandidates === null) {
    return [
      {
        status: 'INVALID',
        type: 'InvalidInput',
        confidence: 0,
        points: 0,
        evidence: { reason: 'PPE items input is null, undefined, or invalid' },
      },
    ];
  }

  const config = cfg ?? CONFIG;
  const ppeCfg = config.ppe ?? {};
  const minConfCfg = config.minConf ?? {};
  const violationsCfg = config.violations ?? {};

  const headRegion = ppeCfg.headRegion ?? [0, 0.28];
  const torsoRegion = ppeCfg.torsoRegion ?? [0.2, 0.65];
  const hardhatIoA = ppeCfg.hardhatIoA ?? 0.5;
  const vestIoA = ppeCfg.vestIoA ?? 0.5;
  const minPersonHeightPx = ppeCfg.minPersonHeightPx ?? 120;

  const minHardhatConf = minConfCfg.hardhat ?? 0.4;
  const minVestConf = minConfCfg.vest ?? 0.4;
  const minPersonConf = minConfCfg.person ?? 0.5;

  const personParsed = parseBox(person);
  if (!personParsed) {
    return [
      {
        status: 'INVALID',
        type: 'InvalidInput',
        confidence: 0,
        points: 0,
        evidence: { reason: 'Person bounding box is null, missing, or has non-finite coordinates' },
      },
    ];
  }

  if (personParsed.isZeroArea) {
    return [
      {
        status: 'INVALID',
        type: 'InvalidInput',
        confidence: 0,
        points: 0,
        evidence: { reason: 'Person bounding box has zero area' },
      },
    ];
  }

  // Validate person confidence
  const rawPersonConf = person?.confidence ?? person?.bbox?.confidence;
  const hasPersonConf = rawPersonConf !== undefined;
  const personConf = hasPersonConf ? rawPersonConf : 1.0;

  if (!isValidConfidence(personConf)) {
    return [
      {
        status: 'INVALID',
        type: 'InvalidInput',
        confidence: 0,
        points: 0,
        evidence: { reason: `Person detection confidence is malformed (${rawPersonConf})` },
      },
    ];
  }

  if (personConf < minPersonConf) {
    return [
      {
        status: 'UNCERTAIN',
        type: 'UncertainPerson',
        confidence: personConf,
        points: 0,
        evidence: { reason: `Person detection confidence (${personConf}) is below threshold (${minPersonConf})` },
      },
    ];
  }

  const [px1, py1, px2, py2] = personParsed.box;
  const pHeight = personParsed.height;

  // Skip evaluation for workers below minimum pixel height
  if (pHeight < minPersonHeightPx) {
    return [
      {
        status: 'SKIPPED',
        type: 'SkippedWorker',
        confidence: personConf,
        points: 0,
        evidence: {
          reason: `Person height (${pHeight}px) is below minPersonHeightPx threshold (${minPersonHeightPx}px)`,
          height: pHeight,
          minPersonHeightPx,
        },
      },
    ];
  }

  // Expected anatomical regions derived from proportional bounding box ratios
  const headRegionBox = [px1, py1 + headRegion[0] * pHeight, px2, py1 + headRegion[1] * pHeight];
  const torsoRegionBox = [px1, py1 + torsoRegion[0] * pHeight, px2, py1 + torsoRegion[1] * pHeight];

  const results = [];

  // Evaluate helmet / hardhat
  const helmetResult = evaluateItemCompliance(
    rawCandidates,
    isHardhatCandidate,
    headRegionBox,
    hardhatIoA,
    minHardhatConf,
    'hardhat'
  );

  if (!helmetResult.compliant) {
    const isViolation = helmetResult.status === 'VIOLATION';
    const type = isViolation ? 'MissingHardhat' : 'UncertainHardhat';
    results.push({
      status: helmetResult.status,
      type,
      confidence: isViolation ? personConf : (helmetResult.evidenceDetails.bestCandidate?.confidence ?? personConf),
      points: isViolation ? (violationsCfg.MissingHardhat?.base ?? 0) : 0,
      evidence: helmetResult.evidenceDetails,
    });
  }

  // Evaluate high-visibility safety vest
  const vestResult = evaluateItemCompliance(
    rawCandidates,
    isVestCandidate,
    torsoRegionBox,
    vestIoA,
    minVestConf,
    'vest'
  );

  if (!vestResult.compliant) {
    const isViolation = vestResult.status === 'VIOLATION';
    const type = isViolation ? 'MissingVest' : 'UncertainVest';
    results.push({
      status: vestResult.status,
      type,
      confidence: isViolation ? personConf : (vestResult.evidenceDetails.bestCandidate?.confidence ?? personConf),
      points: isViolation ? (violationsCfg.MissingVest?.base ?? 0) : 0,
      evidence: vestResult.evidenceDetails,
    });
  }

  return results;
}

export default ppeRule;
