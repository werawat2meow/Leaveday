"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import SignaturePad from "signature_pad";

export type SigHandle = {
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
  fromData: (data: any) => void;
};

type Props = {
  className?: string;
  backgroundColor?: string;
  penColor?: string;
  minWidth?: number;
  maxWidth?: number;
};

const SignaturePadWrapper = forwardRef<SigHandle, Props>((
  { className = "w-full", backgroundColor = "rgba(255,255,255,0)", penColor = "#000", minWidth = 1, maxWidth = 3 },
  ref
) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    let ro: ResizeObserver | null = null;
    let canceled = false;

    const initOrResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current || canvas;
      if (!canvas || !container) return;

      const prevData = padRef.current?.toData();

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${Math.round(rect.width)}px`;
      canvas.style.height = `${Math.round(rect.height)}px`;

      // improve touch drawing behaviour on mobile
      try { canvas.style.touchAction = 'none'; } catch {}
      // allow keyboard focus if needed
      try { canvas.tabIndex = 0; } catch {}

      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
      }

      try { padRef.current?.off && padRef.current.off(); } catch {}
      padRef.current = new SignaturePad(canvas, { backgroundColor, penColor, minWidth, maxWidth });

      if (prevData && padRef.current?.fromData) {
        try { padRef.current.fromData(prevData); } catch {}
      }
    };

    const schedule = () => setTimeout(() => { if (!canceled) initOrResize(); }, 50);
    schedule();

    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(initOrResize);
      if (containerRef.current) ro.observe(containerRef.current);
    }
    window.addEventListener("resize", initOrResize);

    return () => {
      canceled = true;
      window.removeEventListener("resize", initOrResize);
      if (ro) ro.disconnect();
      try { padRef.current?.off && padRef.current.off(); } catch {}
      try { padRef.current = null; } catch {}
    };
  }, []);

  useImperativeHandle(ref, () => ({
    toDataURL: () => {
      if (!padRef.current || padRef.current.isEmpty()) return null;
      try { return padRef.current.toDataURL("image/png"); } catch { return null; }
    },
    clear: () => padRef.current?.clear(),
    isEmpty: () => padRef.current ? padRef.current.isEmpty() : true,
    fromData: (data: any) => { padRef.current?.fromData && padRef.current.fromData(data); },
  }), []);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} className="w-full h-28 sm:h-40 md:h-48 border rounded bg-white" />
    </div>
  );
});

export default SignaturePadWrapper;