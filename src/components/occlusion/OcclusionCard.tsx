"use client";

import { Flashcard, OcclusionBox } from "@/types/flashcard";
import { motion } from "framer-motion";

interface OcclusionCardProps {
  card: Flashcard;
  isFlipped: boolean;
}

export default function OcclusionCard({ card, isFlipped }: OcclusionCardProps) {
  if (!card.imageSrc || !card.occlusionBoxes) {
    return <div className="p-4 text-red-500">Error: Missing image or boxes for occlusion card.</div>;
  }

  return (
    <div className="relative w-full max-w-2xl mx-auto rounded-xl overflow-hidden shadow-2xl border-4 border-white/10 bg-black">
      <div className="relative aspect-auto">
        <img 
          src={card.imageSrc} 
          alt="Occlusion diagram" 
          className="w-full h-auto block select-none" 
          draggable={false}
        />
        
        {/* All occlusion boxes */}
        {card.occlusionBoxes.map((box) => {
          const isTarget = box.id === card.targetBoxId;
          
          return (
            <motion.div
              key={box.id}
              initial={false}
              animate={{
                opacity: (isFlipped && isTarget) ? 0 : 1,
                scale: (isFlipped && isTarget) ? 0.9 : 1,
              }}
              transition={{ duration: 0.3 }}
              className={`absolute flex items-center justify-center transform-gpu ${
                isTarget 
                  ? "bg-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.6)] z-20 border-2 border-amber-600 ring-2 ring-amber-400 ring-offset-2 ring-offset-black/20" 
                  : "bg-slate-800/90 z-10"
              }`}
              style={{
                left: `${box.x}%`,
                top: `${box.y}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
              }}
            >
              {!isFlipped && isTarget && (
                <div className="relative w-full h-full flex items-center justify-center">
                   <div className="absolute inset-0 animate-ping bg-amber-200/50 rounded-sm" />
                   <span className="relative font-bold text-amber-900 text-sm">?</span>
                </div>
              )}
              {!isTarget && (
                 <div className="w-full h-full bg-slate-900/40 backdrop-blur-[1px]" />
              )}
            </motion.div>
          );
        })}
      </div>
      
      {isFlipped && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-0 pointer-events-none"
        >
          {/* We could add some success indicator here if we wanted */}
        </motion.div>
      )}
    </div>
  );
}
