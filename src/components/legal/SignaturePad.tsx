import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Eraser, Check, RotateCcw, PenTool, Type, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SignaturePadProps {
  onSignatureChange: (signature: string | null) => void;
  disabled?: boolean;
  existingSignature?: string | null;
  signerName?: string;
  signerRole?: 'owner' | 'admin' | 'driver' | 'witness' | string;
  label?: string;
  className?: string;
}

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  points: Point[];
  color: string;
  width: number;
}

const SCRIPT_FONTS = [
  { id: 'script-1', label: 'Classic Script', font: 'italic 34px "Brush Script MT", "Segoe Script", cursive' },
  { id: 'script-2', label: 'Modern Cursive', font: '30px "Dancing Script", "Caveat", "Snell Roundhand", cursive' },
  { id: 'script-3', label: 'Formal Signature', font: 'italic 28px "Georgia", "Times New Roman", serif' },
];

const PEN_COLORS = [
  { id: 'navy', label: 'Dark Ink', value: '#0f172a' },
  { id: 'royal', label: 'Royal Blue', value: '#1e3a8a' },
  { id: 'black', label: 'Jet Black', value: '#000000' },
];

const SignaturePad: React.FC<SignaturePadProps> = ({
  onSignatureChange,
  disabled = false,
  existingSignature = null,
  signerName = '',
  signerRole = 'Signer',
  label,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);

  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState(signerName);
  const [selectedFont, setSelectedFont] = useState(SCRIPT_FONTS[0].id);
  const [penColor, setPenColor] = useState(PEN_COLORS[0].value);
  const [penWidth, setPenWidth] = useState(2.5);
  const [hasSignature, setHasSignature] = useState(Boolean(existingSignature));
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 500, height: 160 });

  // Keep typedName in sync if signerName changes and user hasn't typed
  useEffect(() => {
    if (signerName && !typedName) {
      setTypedName(signerName);
    }
  }, [signerName, typedName]);

  // Redraw all strokes on canvas
  const redrawCanvas = useCallback((width: number, height: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Subtle baseline guide line
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, height - 35);
    ctx.lineTo(width - 20, height - 35);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw strokes
    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (let i = 1; i < stroke.points.length; i++) {
        // Use midpoint curve smoothing
        const p1 = stroke.points[i - 1];
        const p2 = stroke.points[i];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      }
      ctx.stroke();
    }
  }, []);

  // Handle ResizeObserver to ensure canvas adapts to dialog / viewport width
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(280, Math.floor(rect.width));
      const height = 150;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      setCanvasDimensions({ width, height });

      if (existingSignature) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, width, height);
          setHasSignature(true);
        };
        img.src = existingSignature;
      } else if (strokesRef.current.length > 0) {
        redrawCanvas(width, height);
      } else {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.scale(dpr, dpr);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);

          // Baseline
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(20, height - 35);
          ctx.lineTo(width - 20, height - 35);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };

    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);

    return () => ro.disconnect();
  }, [existingSignature, redrawCanvas]);

  // Generate signature from typed text
  const generateTypedSignature = useCallback((name: string, fontId: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvasDimensions;
    const dpr = window.devicePixelRatio || 1;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Baseline guide
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, height - 35);
    ctx.lineTo(width - 20, height - 35);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!name.trim()) {
      setHasSignature(false);
      onSignatureChange(null);
      return;
    }

    const fontConfig = SCRIPT_FONTS.find((f) => f.id === fontId) || SCRIPT_FONTS[0];

    // Render typed cursive signature
    ctx.fillStyle = penColor;
    ctx.font = fontConfig.font;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(name.trim(), 28, height - 42);

    // Render small digital timestamp stamp under the line
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(
      `Digitally signed: ${new Date().toLocaleDateString()} · ${signerRole.toUpperCase()}`,
      28,
      height - 18
    );

    strokesRef.current = [];
    setHasSignature(true);
    const dataUrl = canvas.toDataURL('image/png');
    onSignatureChange(dataUrl);
  }, [canvasDimensions, penColor, signerRole, onSignatureChange]);

  const getCoordinates = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || mode !== 'draw') return;
    const coords = getCoordinates(e);
    if (!coords) return;

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    const newStroke: Stroke = {
      points: [coords],
      color: penColor,
      width: penWidth,
    };
    currentStrokeRef.current = newStroke;
    strokesRef.current.push(newStroke);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled || mode !== 'draw') return;
    const coords = getCoordinates(e);
    if (!coords || !currentStrokeRef.current) return;

    currentStrokeRef.current.points.push(coords);
    redrawCanvas(canvasDimensions.width, canvasDimensions.height);
  };

  const stopDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    currentStrokeRef.current = null;

    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if capture wasn't held
    }

    const canvas = canvasRef.current;
    if (canvas && strokesRef.current.length > 0) {
      setHasSignature(true);
      const signatureDataUrl = canvas.toDataURL('image/png');
      onSignatureChange(signatureDataUrl);
    }
  };

  const clearSignature = () => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setHasSignature(false);
    onSignatureChange(null);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasDimensions.width, canvasDimensions.height);

    // Baseline
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(20, canvasDimensions.height - 35);
    ctx.lineTo(canvasDimensions.width - 20, canvasDimensions.height - 35);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  const undoLastStroke = () => {
    if (strokesRef.current.length === 0) return;
    strokesRef.current.pop();

    if (strokesRef.current.length === 0) {
      clearSignature();
    } else {
      redrawCanvas(canvasDimensions.width, canvasDimensions.height);
      const canvas = canvasRef.current;
      if (canvas) {
        onSignatureChange(canvas.toDataURL('image/png'));
      }
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium flex items-center gap-1.5 text-foreground">
            <PenTool className="h-4 w-4 text-primary" />
            {label || `${signerRole} Signature`}
          </label>
          {hasSignature ? (
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1">
              <Check className="h-3 w-3" /> Captured
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Required
            </Badge>
          )}
        </div>

        {!disabled && (
          <Tabs value={mode} onValueChange={(val) => {
            const nextMode = val as 'draw' | 'type';
            setMode(nextMode);
            if (nextMode === 'type') {
              generateTypedSignature(typedName, selectedFont);
            }
          }} className="w-auto">
            <TabsList className="h-8">
              <TabsTrigger value="draw" className="text-xs px-2.5 h-7 gap-1">
                <PenTool className="h-3 w-3" /> Draw
              </TabsTrigger>
              <TabsTrigger value="type" className="text-xs px-2.5 h-7 gap-1">
                <Type className="h-3 w-3" /> Type
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {/* Type-mode inputs */}
      {!disabled && mode === 'type' && (
        <div className="bg-muted/40 p-3 rounded-lg border space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Full Legal Name</span>
              <Input
                id="typed-signature-name"
                value={typedName}
                onChange={(e) => {
                  setTypedName(e.target.value);
                  generateTypedSignature(e.target.value, selectedFont);
                }}
                placeholder="Enter full legal name..."
                className="h-9 text-sm bg-background"
              />
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Signature Style</span>
              <div className="flex gap-1.5">
                {SCRIPT_FONTS.map((font) => (
                  <Button
                    key={font.id}
                    type="button"
                    variant={selectedFont === font.id ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 h-9 text-xs"
                    onClick={() => {
                      setSelectedFont(font.id);
                      generateTypedSignature(typedName, font.id);
                    }}
                  >
                    {font.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draw-mode options: pen color & thickness */}
      {!disabled && mode === 'draw' && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Color:</span>
            <div className="flex items-center gap-1">
              {PEN_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setPenColor(color.value)}
                  className={cn(
                    'w-5 h-5 rounded-full border border-white shadow-sm transition-transform',
                    penColor === color.value && 'ring-2 ring-primary ring-offset-1 scale-110'
                  )}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                  aria-label={color.label}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span>Stroke:</span>
            <div className="flex items-center gap-1">
              {[
                { label: 'Fine', width: 1.8 },
                { label: 'Normal', width: 2.8 },
                { label: 'Bold', width: 4.2 },
              ].map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant={penWidth === s.width ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setPenWidth(s.width)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative border-2 border-dashed border-muted-foreground/30 rounded-lg overflow-hidden bg-white shadow-inner"
      >
        <canvas
          ref={canvasRef}
          className={cn(
            'w-full h-[150px] touch-none block',
            disabled || mode !== 'draw' ? 'cursor-default' : 'cursor-crosshair'
          )}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
        />

        {/* Empty state overlay prompt */}
        {!hasSignature && !disabled && mode === 'draw' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-muted-foreground/50 select-none">
            <PenTool className="h-6 w-6 mb-1 opacity-40 animate-pulse" />
            <span className="text-sm font-medium">Draw your signature here</span>
            <span className="text-[11px] opacity-75">Touch, pen, or mouse supported</span>
          </div>
        )}

        {disabled && existingSignature && (
          <div className="absolute top-2 right-2 pointer-events-none">
            <div className="bg-emerald-600 text-white px-2 py-1 rounded text-xs flex items-center gap-1 shadow-sm font-medium">
              <Check className="h-3.5 w-3.5" />
              Electronically Signed
            </div>
          </div>
        )}
      </div>

      {/* Footer controls & legal compliance note */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span>Legally binding e-signature under UETA / ESIGN &amp; NDPR</span>
        </div>

        {!disabled && (
          <div className="flex items-center gap-1.5">
            {mode === 'draw' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={undoLastStroke}
                disabled={strokesRef.current.length === 0}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo
              </Button>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={clearSignature}
              disabled={!hasSignature}
            >
              <Eraser className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SignaturePad;

