import type { MeshPayload } from './mesh-payload';
import type { PrintPreset } from '../model';

/**
 * Pre-flight check for 3D printing.
 *
 * A slicer will happily slice a model that is subtly broken and produce a print
 * that fails two hours in. Every rule here is one that a slicer either refuses
 * outright or silently "repairs" into something the user did not ask for, and
 * each finding is written to be acted on without knowing what a manifold is.
 *
 * The analysis is deliberately conservative about cost: it welds vertices by
 * position (because a slicer does too), so it works whether the mesh is indexed
 * or a soup of flat triangles.
 */

/** How bad a finding is. `warning` still prints; `blocker` usually will not. */
export type PrintSeverity = 'blocker' | 'warning';

export interface PrintIssue {
  readonly id: string;
  readonly severity: PrintSeverity;
  /** One line, no jargon. */
  readonly title: string;
  /** What is actually wrong, and what it means for the print. */
  readonly detail: string;
  /** The setting to change. */
  readonly fix: string;
}

export interface PrintSize {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PrintReport {
  /** `blocked` means the file should not go to a printer as it stands. */
  readonly status: 'ready' | 'warnings' | 'blocked';
  /** Bounding box in millimetres. */
  readonly size: PrintSize;
  /** Edges belonging to only one triangle — holes in the surface. */
  readonly openEdges: number;
  /** Edges shared by more than two triangles — geometry folded through itself. */
  readonly nonManifoldEdges: number;
  readonly degenerateTriangles: number;
  /**
   * Share of the *visible* (upward-facing) area that is steeper than 60°, 0–1.
   *
   * A height field can never undercut itself, so classic overhangs do not occur
   * here — but a cliff that steep prints as a ragged near-vertical wall, which
   * is the same problem wearing a different hat.
   */
  readonly steepRatio: number;
  readonly issues: readonly PrintIssue[];
  readonly headline: string;
}

export interface PrintCheckOptions {
  readonly mode: MeshPayload['mode'];
  readonly printPreset: PrintPreset;
  /** Slab thickness in millimetres — the thinnest wall in most models. */
  readonly baseThickness: number;
  readonly base: boolean;
}

/** Smaller than this and a 0.4 mm nozzle cannot lay down two perimeters. */
const MIN_WALL_MM = 0.8;
/** A lithophane has to be thin enough to let light through, so it is exempt. */
const MIN_LITHOPHANE_WALL_MM = 0.6;
/** Below ~5 mm across, surface detail stops resolving. */
const MIN_FEATURE_MM = 5;
/** A Prusa MK4 bed is 250 mm; leave room for a brim. */
const MAX_BED_MM = 220;
/** cos 60° — the normal of a 60° slope, the point where walls print badly. */
const STEEP_NORMAL_Y = 0.5;
/**
 * Below this share of the visible surface, steep faces are not worth reporting.
 * Set high enough that a normally-tuned relief does not trip it: the point is
 * to catch a model that is *dominated* by cliffs, not one with a few.
 */
const STEEP_SHARE_THRESHOLD = 0.1;

export function checkPrintability(payload: MeshPayload, options: PrintCheckOptions): PrintReport {
  const issues: PrintIssue[] = [];

  const [minX, minY, minZ] = payload.bounds.min;
  const [maxX, maxY, maxZ] = payload.bounds.max;
  const size: PrintSize = {
    x: Math.max(0, maxX - minX),
    y: Math.max(0, maxY - minY),
    z: Math.max(0, maxZ - minZ),
  };

  if (options.mode === 'points') {
    return {
      status: 'blocked',
      size,
      openEdges: 0,
      nonManifoldEdges: 0,
      degenerateTriangles: 0,
      steepRatio: 0,
      headline: 'A point cloud has no surfaces, so there is nothing to slice.',
      issues: [
        {
          id: 'points',
          severity: 'blocker',
          title: 'Point clouds cannot be printed',
          detail:
            'This mode stores loose particles rather than a solid surface. A printer needs a closed surface to work out what is inside and what is outside.',
          fix: 'Switch the generation mode to Relief, Extrude or Voxel.',
        },
      ],
    };
  }

  const topology = analyseTopology(payload);

  if (topology.openEdges > 0) {
    issues.push({
      id: 'open-edges',
      severity: 'blocker',
      title: `The surface has ${formatCount(topology.openEdges, 'open edge')}`,
      detail:
        'Part of the model is an open shell, so a slicer cannot tell inside from outside. It will either fill the whole block or drop the missing faces.',
      fix: options.base
        ? 'Turn on “Add a solid base” to close the model.'
        : 'Turn on “Add a solid base” under Solid base.',
    });
  }

  if (topology.nonManifoldEdges > 0) {
    issues.push({
      id: 'non-manifold',
      severity: 'warning',
      title: `${formatCount(topology.nonManifoldEdges, 'edge')} shared by too many faces`,
      detail:
        'More than two faces meet along these edges — normally where two parts of the model touch at a corner rather than along a whole face. Slicers repair it, but the repair can leave a fine scar.',
      fix: 'Usually harmless. If the print shows artefacts, lower Detail or Smoothing and regenerate.',
    });
  }

  if (topology.degenerateTriangles > 0) {
    issues.push({
      id: 'degenerate',
      severity: 'warning',
      title: `${formatCount(topology.degenerateTriangles, 'zero-area triangle')}`,
      detail:
        'These triangles have collapsed to a line or a point. They add nothing and can make a slicer stutter.',
      fix: 'Reduce Detail (resolution) or Smoothing.',
    });
  }

  const minWall = options.printPreset === 'lithophane' ? MIN_LITHOPHANE_WALL_MM : MIN_WALL_MM;
  if (options.base && options.baseThickness < minWall) {
    issues.push({
      id: 'thin-wall',
      severity: 'warning',
      title: `Backing slab is only ${options.baseThickness.toFixed(1)} mm thick`,
      detail:
        'A 0.4 mm nozzle needs about 0.8 mm to lay down two solid walls. Anything thinner prints translucent and snaps easily.',
      fix: `Increase Base thickness to at least ${minWall.toFixed(1)} mm.`,
    });
  }

  const smallest = Math.min(size.x, size.y, size.z);
  if (smallest > 0 && smallest < MIN_FEATURE_MM) {
    issues.push({
      id: 'tiny',
      severity: 'warning',
      title: `Thinnest dimension is ${smallest.toFixed(1)} mm`,
      detail: 'Below about 5 mm, fine surface detail stops resolving and small parts break off.',
      fix: 'Increase Size or Depth.',
    });
  }

  const largest = Math.max(size.x, size.y, size.z);
  if (largest > MAX_BED_MM) {
    issues.push({
      id: 'oversize',
      severity: 'warning',
      title: `${largest.toFixed(0)} mm is larger than most printer beds`,
      detail:
        'Most beds top out around 220–250 mm. Oversized models have to be cut up or scaled down in the slicer.',
      fix: 'Reduce Size, or scale the model down after exporting.',
    });
  }

  if (topology.steepRatio > STEEP_SHARE_THRESHOLD) {
    const percent = Math.round(topology.steepRatio * 100);
    issues.push({
      id: 'steep-slope',
      severity: 'warning',
      title: `${percent}% of the surface is steeper than 60°`,
      detail:
        'Faces this close to vertical print as ragged walls: each layer barely overlaps the last, so the edge stair-steps and can curl.',
      fix: 'Reduce Depth, or increase Smoothing to soften the slopes.',
    });
  }

  const hasBlocker = issues.some((issue) => issue.severity === 'blocker');
  const status: PrintReport['status'] = hasBlocker
    ? 'blocked'
    : issues.length > 0
      ? 'warnings'
      : 'ready';

  return {
    status,
    size,
    openEdges: topology.openEdges,
    nonManifoldEdges: topology.nonManifoldEdges,
    degenerateTriangles: topology.degenerateTriangles,
    steepRatio: topology.steepRatio,
    issues,
    headline: headlineFor(status, size, issues.length),
  };
}

function headlineFor(status: PrintReport['status'], size: PrintSize, issueCount: number): string {
  const dimensions = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;

  if (status === 'blocked') {
    return `${dimensions} — this will not slice as it is.`;
  }
  if (status === 'warnings') {
    return `${dimensions} — printable, with ${formatCount(issueCount, 'thing')} to check.`;
  }
  return `${dimensions} — closed solid, ready to slice.`;
}

// ---------------------------------------------------------------------------
// Mesh analysis
// ---------------------------------------------------------------------------

interface Topology {
  readonly openEdges: number;
  readonly nonManifoldEdges: number;
  readonly degenerateTriangles: number;
  readonly steepRatio: number;
}

/**
 * Welds the mesh by position and inspects the result.
 *
 * Welding is the point: two triangles that merely touch are two surfaces to a
 * slicer, while two that share a vertex are one. Everything downstream — open
 * edges, overhang area — is measured on the welded mesh because that is the
 * shape the printer will actually receive.
 */
function analyseTopology(payload: MeshPayload): Topology {
  const { positions } = payload;
  // Non-indexed payloads (flat-shaded reliefs, voxel stacks) are already a
  // triangle soup: every three vertices are one face. Both layouts get welded
  // the same way, because that is what a slicer does to them.
  const raw = payload.indices ?? sequentialTriangles(positions.length / 3);

  const welds = new Map<string, number>();
  const remapped = new Int32Array(raw.length);
  // Welded ids are handed out in first-seen order, so the welded mesh needs its
  // own position array rather than reading through to the original one.
  const weldedPositions: number[] = [];
  const key = [0, 0, 0];

  for (let i = 0; i < raw.length; i++) {
    const vertex = raw[i] ?? 0;
    const x = positions[vertex * 3] ?? 0;
    const y = positions[vertex * 3 + 1] ?? 0;
    const z = positions[vertex * 3 + 2] ?? 0;
    key[0] = quantize(x);
    key[1] = quantize(y);
    key[2] = quantize(z);
    const id = `${key[0]}|${key[1]}|${key[2]}`;

    let welded = welds.get(id);
    if (welded === undefined) {
      welded = welds.size;
      welds.set(id, welded);
      weldedPositions.push(x, y, z);
    }
    remapped[i] = welded;
  }

  return measure(new Float32Array(weldedPositions), remapped);
}

/** Triangle soup for non-indexed payloads: vertex 3n, 3n+1, 3n+2. */
function sequentialTriangles(vertexCount: number): Int32Array {
  const tris = new Int32Array(Math.floor(vertexCount / 3) * 3);
  for (let i = 0; i < tris.length; i++) {
    tris[i] = i;
  }
  return tris;
}

function measure(positions: Float32Array, triangles: Int32Array): Topology {
  const edges = new Map<string, number>();
  let openEdges = 0;
  let nonManifoldEdges = 0;
  let degenerateTriangles = 0;
  let steepArea = 0;
  let visibleArea = 0;

  for (let t = 0; t + 2 < triangles.length; t += 3) {
    const a = triangles[t] ?? 0;
    const b = triangles[t + 1] ?? 0;
    const c = triangles[t + 2] ?? 0;

    const ax = positions[a * 3] ?? 0;
    const ay = positions[a * 3 + 1] ?? 0;
    const az = positions[a * 3 + 2] ?? 0;
    const ux = (positions[b * 3] ?? 0) - ax;
    const uy = (positions[b * 3 + 1] ?? 0) - ay;
    const uz = (positions[b * 3 + 2] ?? 0) - az;
    const vx = (positions[c * 3] ?? 0) - ax;
    const vy = (positions[c * 3 + 1] ?? 0) - ay;
    const vz = (positions[c * 3 + 2] ?? 0) - az;

    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    // Twice the area, which is all the ratios below need.
    const magnitude = Math.hypot(nx, ny, nz);

    if (magnitude < 1e-7 || a === b || b === c || a === c) {
      degenerateTriangles++;
      continue;
    }

    // Only the upward-facing side is "visible": walls are vertical on purpose
    // and the back face rests on the bed, so neither counts as a slope.
    const facing = ny / magnitude;
    if (facing > 0) {
      visibleArea += magnitude;
      if (facing < STEEP_NORMAL_Y) {
        steepArea += magnitude;
      }
    }

    countEdge(edges, a, b);
    countEdge(edges, b, c);
    countEdge(edges, c, a);
  }

  for (const uses of edges.values()) {
    if (uses === 1) {
      openEdges++;
    } else if (uses > 2) {
      nonManifoldEdges++;
    }
  }

  return {
    openEdges,
    nonManifoldEdges,
    degenerateTriangles,
    steepRatio: visibleArea > 0 ? steepArea / visibleArea : 0,
  };
}

function countEdge(edges: Map<string, number>, a: number, b: number): void {
  const key = a < b ? `${a}_${b}` : `${b}_${a}`;
  edges.set(key, (edges.get(key) ?? 0) + 1);
}

/** 1 µm buckets: tight enough to be exact, loose enough to absorb float noise. */
function quantize(value: number): number {
  return Math.round(value * 1000);
}

function formatCount(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}
