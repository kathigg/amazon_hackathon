"use client";
import { useEffect, useRef, useState } from "react";

interface Bill {
  id: string;
  title: string;
  status: string;
  stage: "introduced" | "committee" | "house_passed" | "senate" | "signed" | "vetoed";
}

interface CongressVisualizationProps {
  bills: Bill[];
}

export default function CongressVisualization({ bills }: CongressVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredBill, setHoveredBill] = useState<Bill | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const width = rect.width;
    const height = rect.height;

    // Group bills by stage
    const billsByStage = {
      introduced: bills.filter((b) => b.stage === "introduced"),
      committee: bills.filter((b) => b.stage === "committee"),
      house_passed: bills.filter((b) => b.stage === "house_passed"),
      senate: bills.filter((b) => b.stage === "senate"),
      signed: bills.filter((b) => b.stage === "signed"),
      vetoed: bills.filter((b) => b.stage === "vetoed"),
    };

    // Stage positions (left to right flow)
    const stages = [
      { key: "introduced", label: "Introduced", x: width * 0.1, color: "#94a3b8" },
      { key: "committee", label: "Committee", x: width * 0.25, color: "#60a5fa" },
      { key: "house_passed", label: "House Passed", x: width * 0.45, color: "#34d399" },
      { key: "senate", label: "Senate", x: width * 0.65, color: "#fbbf24" },
      { key: "signed", label: "Signed", x: width * 0.85, color: "#10b981" },
    ];

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw Congress building outline
    drawCongressOutline(ctx, width, height);

    // Draw stage labels and connections
    for (let i = 0; i < stages.length - 1; i++) {
      const stage = stages[i];
      const nextStage = stages[i + 1];

      // Draw connection line
      ctx.strokeStyle = "#e5e7eb";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(stage.x, height * 0.5);
      ctx.lineTo(nextStage.x, height * 0.5);
      ctx.stroke();
    }

    // Draw bills as circles
    stages.forEach((stage) => {
      const stageBills = billsByStage[stage.key as keyof typeof billsByStage];
      const count = stageBills.length;

      // Label
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(stage.label, stage.x, height * 0.2);
      ctx.fillText(`(${count})`, stage.x, height * 0.2 + 15);

      // Draw bills in a cluster
      stageBills.forEach((bill, i) => {
        const angle = (i / count) * Math.PI * 2;
        const radius = Math.min(30, count * 2);
        const x = stage.x + Math.cos(angle) * radius;
        const y = height * 0.5 + Math.sin(angle) * radius;

        // Bill circle
        ctx.fillStyle = stage.color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Hover effect
        if (hoveredBill?.id === bill.id) {
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    });
  }, [bills, hoveredBill]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setMousePos({ x: e.clientX, y: e.clientY });

    // Check if hovering over a bill
    // (Simplified - in production, track bill positions)
    setHoveredBill(null);
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="w-full h-96 bg-gradient-to-br from-blue-50 to-amber-50 rounded-2xl"
        onMouseMove={handleMouseMove}
      />
      
      {hoveredBill && (
        <div
          className="absolute bg-white shadow-lg rounded-lg p-4 max-w-xs pointer-events-none z-10"
          style={{
            left: mousePos.x + 10,
            top: mousePos.y + 10,
          }}
        >
          <p className="font-bold text-sm text-navy mb-1">{hoveredBill.id}</p>
          <p className="text-xs text-gray-600">{hoveredBill.title.substring(0, 100)}...</p>
          <p className="text-xs text-gray-400 mt-2">{hoveredBill.status}</p>
        </div>
      )}
    </div>
  );
}

function drawCongressOutline(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // Simple Capitol building silhouette
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.fillStyle = "#f1f5f9";

  // Dome
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.5, 40, Math.PI, 0);
  ctx.fill();
  ctx.stroke();

  // House (left)
  ctx.fillRect(width * 0.3, height * 0.5, width * 0.15, height * 0.3);
  ctx.strokeRect(width * 0.3, height * 0.5, width * 0.15, height * 0.3);

  // Senate (right)
  ctx.fillRect(width * 0.55, height * 0.5, width * 0.15, height * 0.3);
  ctx.strokeRect(width * 0.55, height * 0.5, width * 0.15, height * 0.3);
}
