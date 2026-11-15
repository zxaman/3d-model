import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PrintIssue, PrintReport } from '@engine/geometry/print-check';
import { PrintCheck } from './print-check';

function report(overrides: Partial<PrintReport> = {}): PrintReport {
  return {
    status: 'ready',
    size: { x: 100, y: 10, z: 100 },
    openEdges: 0,
    nonManifoldEdges: 0,
    degenerateTriangles: 0,
    steepRatio: 0,
    issues: [],
    headline: '100.0 × 10.0 × 100.0 mm — closed solid, ready to slice.',
    ...overrides,
  };
}

const STEEP: PrintIssue = {
  id: 'steep-slope',
  severity: 'warning',
  title: '27% of the surface is steeper than 60°',
  detail: 'Faces this close to vertical print as ragged walls.',
  fix: 'Reduce Depth, or increase Smoothing to soften the slopes.',
};

describe('PrintCheck', () => {
  let fixture: ComponentFixture<PrintCheck>;

  async function render(value: PrintReport | null): Promise<HTMLElement> {
    fixture = TestBed.createComponent(PrintCheck);
    fixture.componentRef.setInput('report', value);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function summary(host: HTMLElement): HTMLButtonElement | null {
    return host.querySelector('.print-check__summary');
  }

  it('renders nothing until there is a model to report on', async () => {
    const host = await render(null);

    expect(summary(host)).toBeNull();
  });

  it('states the size and the verdict in one line', async () => {
    const host = await render(report());

    expect(host.textContent).toContain('100.0 × 10.0 × 100.0 mm');
    expect(host.querySelector('.print-check')?.getAttribute('data-status')).toBe('ready');
  });

  it('opens itself when the model cannot be sliced', async () => {
    const host = await render(
      report({ status: 'blocked', issues: [{ ...STEEP, severity: 'blocker' }] }),
    );

    expect(host.querySelector('.print-check__issue')).not.toBeNull();
  });

  it('stays collapsed when there is nothing to fix', async () => {
    const host = await render(report());

    expect(summary(host)?.disabled).toBe(true);
    expect(host.querySelector('.print-check__issues')).toBeNull();
  });

  it('shows how many findings there are', async () => {
    const host = await render(report({ status: 'warnings', issues: [STEEP] }));

    expect(host.querySelector('.print-check__count')?.textContent?.trim()).toBe('1');
  });

  it('expands to explain what to change', async () => {
    const host = await render(report({ status: 'warnings', issues: [STEEP] }));

    expect(host.querySelector('.print-check__issues')).toBeNull();

    summary(host)?.click();
    await fixture.whenStable();

    expect(host.textContent).toContain('27% of the surface is steeper than 60°');
    expect(host.textContent).toContain('Reduce Depth, or increase Smoothing');
    expect(summary(host)?.getAttribute('aria-expanded')).toBe('true');
  });

  it('marks a model that cannot be sliced as blocked', async () => {
    const blocked = report({
      status: 'blocked',
      headline: '100.0 × 10.0 × 100.0 mm — this will not slice as it is.',
      openEdges: 896,
      issues: [
        {
          id: 'open-edges',
          severity: 'blocker',
          title: 'The surface has 896 open edges',
          detail: 'Part of the model is an open shell.',
          fix: 'Turn on “Add a solid base”.',
        },
      ],
    });

    const host = await render(blocked);

    expect(host.querySelector('.print-check')?.getAttribute('data-status')).toBe('blocked');
    expect(host.querySelector('.print-check__issue')?.getAttribute('data-severity')).toBe(
      'blocker',
    );
  });

  it('labels every finding with the setting that fixes it', async () => {
    const host = await render(report({ status: 'warnings', issues: [STEEP] }));

    summary(host)?.click();
    await fixture.whenStable();

    expect(host.querySelector('.print-check__fix')?.textContent).toContain('Reduce Depth');
  });
});
