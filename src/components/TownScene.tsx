import { useEffect, useMemo, useRef, useState } from 'react';
import { createTownLayout } from '../data/town-layout';
import type { TownSceneProps } from '../scene/brick-town/types';
import type { mountBrickTown } from '../scene/brick-town/runtime';
export type { TownPost, SceneAnchor } from '../scene/brick-town/types';

const BrickAssemblyLoading = () => {
  const bricks = useMemo(() => Array.from({ length: 81 }, (_, index) => {
    const x = index % 9 - 4;
    const y = Math.floor(index / 9) - 4;
    return { index, distance: Math.hypot(x, y), x, y };
  }).sort((a, b) => a.distance - b.distance), []);
  return <div className="brick-loading" role="status" aria-label="正在从小镇中心搭建积木小镇">
    <div className="brick-assembly" aria-hidden="true">
      {bricks.map((brick, index) => <i key={brick.index} style={{ '--x': brick.x, '--y': brick.y, '--delay': `${index * 13}ms` } as React.CSSProperties} />)}
    </div>
    <span>正在搭建积木小镇…</span>
  </div>;
};

export default function TownScene(props: TownSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<ReturnType<typeof mountBrickTown> | undefined>(undefined);
  const latest = useRef(props); latest.current = props;
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const [assemblyDone, setAssemblyDone] = useState(false);
  const fallback = useMemo(() => props.layout ?? createTownLayout('river-bend-demo-v2', props.posts), [props.layout, props.posts]);
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const canvas = canvasRef.current; if (!canvas) return;
    setError(false); setReady(false); setAssemblyDone(false);
    import('../scene/brick-town/runtime').then(({ mountBrickTown }) => {
      if (cancelled) return;
      runtimeRef.current = mountBrickTown(canvas, fallback, latest.current.posts, latest.current, () => latest.current);
      setReady(true);
      timer = window.setTimeout(() => { if (!cancelled) setAssemblyDone(true); }, 1450);
    }).catch((initializationError) => { if (!cancelled) { console.error('Brick town initialization failed', initializationError); setError(true); } });
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); runtimeRef.current?.dispose(); runtimeRef.current = undefined; };
  }, [fallback, props.posts]);
  useEffect(() => { runtimeRef.current?.update(props); }, [props.colorMode, props.reducedMotion, props.hoveredPostId, props.activePostId, props.query, props.category, props.tag, ready]);
  return <div className="town-canvas-host brick-town-host" data-testid="town-canvas">
    <canvas ref={canvasRef} aria-label="积木小镇：点击建筑或楼层阅读文章" />
    {(!ready || !assemblyDone) && !error && <BrickAssemblyLoading />}
    {error && <div className="brick-loading" role="status">当前设备无法绘制小镇，请通过下方文章列表阅读。</div>}
    <div className="brick-controls" role="group" aria-label="小镇视野">
      <button onClick={() => runtimeRef.current?.zoom(-0.15)} aria-label="缩小小镇">−</button>
      <button onClick={() => runtimeRef.current?.home()} aria-label="恢复全景">⌂</button>
      <button onClick={() => runtimeRef.current?.zoom(0.15)} aria-label="放大小镇">+</button>
    </div>
  </div>;
}
