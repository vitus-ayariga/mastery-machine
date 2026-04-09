"use client";

import { useState, useMemo } from "react";
import { Flashcard } from "@/types/flashcard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Trophy, RefreshCcw, ArrowRight } from "lucide-react";
import 'katex/dist/katex.min.css';
import { BlockMath } from 'react-katex';
import OcclusionCard from "./occlusion/OcclusionCard";
import confetti from "canvas-confetti";
import { useEffect as useConfettiEffect } from "react";

import { updateFlashcardMastery } from "@/lib/db";

interface DrillSessionProps {
  cards: Flashcard[];
  onClearCards: () => void;
}

type DrillStatus = "not-started" | "active" | "mastered";

export default function DrillSession({ cards, onClearCards }: DrillSessionProps) {
  const [status, setStatus] = useState<DrillStatus>("not-started");
  
  // The current active bucket
  const [currentBucket, setCurrentBucket] = useState<Flashcard[]>([]);
  // The bucket for the NEXT round (all the 'missed' cards)
  const [nextBucket, setNextBucket] = useState<Flashcard[]>([]);
  
  // Index of the card currently being viewed in the active bucket
  const [currentIndex, setCurrentIndex] = useState(0);
  // Whether the answer is currently shown
  const [isFlipped, setIsFlipped] = useState(false);
  
  // Round counter
  const [round, setRound] = useState(1);

  const startSession = () => {
    setCurrentBucket([...cards]);
    setNextBucket([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setRound(1);
    setStatus("active");
  };

  const handleGotIt = async () => {
    const card = currentBucket[currentIndex];
    // Simple Spaced Repetition: Increment bucket
    const newBucket = (card.bucket || 0) + 1;
    // Set next review to some time in future (standard Leitner)
    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + Math.pow(2, newBucket));
    
    try {
      if (card.id && !card.id.toString().includes("-")) { // Filter for DB IDs vs temp UUIDs
         await updateFlashcardMastery(card.id, newBucket, nextReview.toISOString());
      }
    } catch (e) {
      console.warn("Could not save mastery state to DB", e);
    }
    
    moveToNextCard();
  };

  const handleMissedIt = async () => {
    const card = currentBucket[currentIndex];
    // Reset bucket on miss
    try {
      if (card.id && !card.id.toString().includes("-")) {
         await updateFlashcardMastery(card.id, 0, new Date().toISOString());
      }
    } catch (e) {
      console.warn("Could not save mastery state to DB", e);
    }

    // Add to next bucket for the next round
    setNextBucket((prev) => [...prev, card]);
    moveToNextCard();
  };

  const moveToNextCard = () => {
    setIsFlipped(false);
    if (currentIndex + 1 < currentBucket.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Round is over
      if (nextBucket.length > 0) {
        // Start next round with missed cards
        setCurrentBucket([...nextBucket]);
        setNextBucket([]);
        setCurrentIndex(0);
        setRound(r => r + 1);
      } else {
        // Nothing missed! Mastered!
        setStatus("mastered");
      }
    }
  };

  // Render content based on card type
  const renderCardContent = (text: string, type: string) => {
    if (type === "equation") {
      return <div className="py-4"><BlockMath math={text} /></div>;
    }
    
    // For blanks, maybe we just show it as text, it already implies context.
    return <p className="text-xl whitespace-pre-wrap leading-relaxed">{text}</p>;
  };

  if (status === "not-started") {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>Ready to Drill?</CardTitle>
          <CardDescription>You have {cards.length} cards to master.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            In this mode, you'll review all cards. If you miss a card, it goes into the "Missed" bucket.
            You'll keep reviewing the missed cards until you've mastered every single one.
          </p>
          <div className="flex gap-4">
            <Button size="lg" onClick={startSession} className="flex-1">
              Start Session
            </Button>
            <Button size="lg" variant="outline" onClick={onClearCards}>
              Clear Cards
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "mastered") {
    return (
      <Card className="border-t-4 border-t-green-500 shadow-xl overflow-hidden relative">
        <div className="absolute inset-0 bg-green-500/10 pointer-events-none" />
        <CardContent className="flex flex-col items-center justify-center p-12 text-center relative z-10">
          <Trophy className="w-24 h-24 text-yellow-500 mb-6 drop-shadow-md animate-bounce" />
          <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-500 to-emerald-700 bg-clip-text text-transparent">Chapter Mastered!</h2>
          <CompletionConfetti />
          <p className="text-lg text-muted-foreground mb-8">
            You successfully drilled through all {cards.length} cards. 
            It took you {round} round(s) to achieve mastery.
          </p>
          <div className="flex gap-4">
            <Button onClick={startSession} variant="outline" className="gap-2">
              <RefreshCcw className="w-4 h-4" /> Repeat Session
            </Button>
            <Button onClick={onClearCards} className="gap-2">
              <ArrowRight className="w-4 h-4" /> Move to Next Chapter
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentCard = currentBucket[currentIndex];
  // Overall progress is how many we've completely mastered relative to original.
  // Actually, computing exact progress is tricky mid-round.
  // Let's show progress within the CURRENT round.
  const progressPercent = ((currentIndex) / currentBucket.length) * 100;

  const typeLabels: Record<string, string> = {
    qa: "Q&A",
    blanks: "Fill in the Blanks",
    equation: "Equation",
    visual: "Visual Description",
    context: "Context Card",
    occlusion: "Image Occlusion",
    mcq: "Multiple Choice"
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between flex-row items-end">
        <div>
          <h2 className="text-2xl font-bold">Round {round}</h2>
          <p className="text-muted-foreground">{currentBucket.length} cards remaining to master</p>
        </div>
        <div className="text-sm font-medium bg-muted px-3 py-1 rounded-full">
          Card {currentIndex + 1} of {currentBucket.length}
        </div>
      </div>
      
      <Progress value={progressPercent} className="h-2" />

      {/* The Flashcard itself */}
      <div className="perspective-1000 min-h-[400px] w-full">
        <Card className={`w-full min-h-[400px] flex flex-col transition-all duration-300 shadow-lg border-2 hover:border-primary/50 relative overflow-hidden`}>
          {/* Card Type Badge */}
          <div className="absolute top-4 right-4 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider">
            {typeLabels[currentCard.type] || currentCard.type}
          </div>

          <CardContent className="flex-1 flex flex-col items-center justify-center p-8 text-center mt-8">
             {currentCard.type === 'occlusion' ? (
                <OcclusionCard card={currentCard} isFlipped={isFlipped} />
             ) : currentCard.type === 'mcq' ? (
                <div className="w-full space-y-6">
                  <p className="text-xl font-semibold">{currentCard.question}</p>
                  <div className="grid grid-cols-1 gap-3 text-left">
                    {currentCard.options?.map((option, i) => {
                      const isCorrect = option === currentCard.answer;
                      return (
                        <div 
                          key={i} 
                          className={`p-4 rounded-xl border-2 transition-all ${
                            isFlipped 
                              ? isCorrect 
                                ? "bg-green-500/10 border-green-500 text-green-700 font-bold" 
                                : "bg-muted border-transparent opacity-50"
                              : "bg-background border-border hover:border-primary/30"
                          }`}
                        >
                          <span className="inline-block w-8 h-8 rounded-full bg-muted flex-shrink-0 text-center leading-8 mr-3 font-mono text-sm">
                            {String.fromCharCode(65 + i)}
                          </span>
                          {option}
                        </div>
                      );
                    })}
                  </div>
                </div>
             ) : (
                <>
                  <div className="w-full flex-1 flex items-center justify-center">
                    {renderCardContent(currentCard.question, currentCard.type)}
                  </div>

                  {isFlipped && (
                    <>
                      <div className="w-full h-px bg-border my-8" />
                      <div className="w-full flex-1 flex items-center justify-center text-primary font-medium animate-in fade-in zoom-in duration-300">
                         {renderCardContent(currentCard.answer, currentCard.type)}
                      </div>
                    </>
                  )}
                </>
             )}
          </CardContent>
          
          <CardFooter className="p-6 bg-muted/20 border-t flex justify-center gap-4">
            {!isFlipped ? (
              <Button size="lg" className="w-full text-lg h-14" onClick={() => setIsFlipped(true)}>
                Show Answer
              </Button>
            ) : (
              <div className="flex w-full gap-4 animate-in slide-in-from-bottom-4 duration-300">
                <Button 
                  size="lg" 
                  variant="destructive" 
                  className="w-1/2 h-14 text-lg"
                  onClick={handleMissedIt}
                >
                  <XCircle className="w-5 h-5 mr-2" /> Missed it
                </Button>
                <Button 
                  size="lg" 
                  className="w-1/2 h-14 text-lg bg-green-600 hover:bg-green-700"
                  onClick={handleGotIt}
                >
                  <CheckCircle2 className="w-5 h-5 mr-2" /> Got it
                </Button>
              </div>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

function CompletionConfetti() {
  useConfettiEffect(() => {
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min: number, max: number) {
      return Math.random() * (max - min) + min;
    }

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return null;
}
