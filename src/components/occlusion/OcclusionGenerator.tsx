"use client";

import { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2, Upload, ChevronLeft, ChevronRight, Crop, Square, Check, Trash2, Save } from "lucide-react";
import { Flashcard, OcclusionBox } from "@/types/flashcard";
import { v4 as uuidv4 } from "uuid";
import { motion, AnimatePresence } from "framer-motion";

// Configure PDF.js worker to use the local file in the public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface OcclusionGeneratorProps {
  onCardsGenerated: (cards: Flashcard[]) => void;
}

type Step = "upload" | "select-page" | "edit-boxes";

export default function OcclusionGenerator({ onCardsGenerated }: OcclusionGeneratorProps) {
  const [step, setStep] = useState<Step>("upload");
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [boxes, setBoxes] = useState<OcclusionBox[]>([]);
  const [drawingBox, setDrawingBox] = useState<{ x: number, y: number, w: number, h: number } | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") return;

    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setNumPages(pdf.numPages);
      setStep("select-page");
    } catch (error) {
      console.error("Error loading PDF:", error);
      alert("Failed to load PDF.");
    } finally {
      setIsProcessing(false);
    }
  };

  const renderPage = async (pageNo: number) => {
    if (!pdfDoc || !canvasRef.current) return;

    setIsProcessing(true);
    try {
      const page = await pdfDoc.getPage(pageNo);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas
        };
        await page.render(renderContext).promise;
      }
    } catch (error) {
      console.error("Error rendering page:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (step === "select-page" && pdfDoc) {
      renderPage(currentPage);
    }
  }, [step, currentPage, pdfDoc]);

  const capturePage = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    setSelectedImage(dataUrl);
    setStep("edit-boxes");
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (step !== "edit-boxes" || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawingBox({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drawingBox || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const curX = ((e.clientX - rect.left) / rect.width) * 100;
    const curY = ((e.clientY - rect.top) / rect.height) * 100;
    setDrawingBox(prev => prev ? {
      ...prev,
      w: curX - prev.x,
      h: curY - prev.y
    } : null);
  };

  const handleMouseUp = () => {
    if (!drawingBox) return;
    
    // Only add boxes that have some size
    if (Math.abs(drawingBox.w) > 1 && Math.abs(drawingBox.h) > 1) {
      const newBox: OcclusionBox = {
        id: uuidv4(),
        x: drawingBox.w > 0 ? drawingBox.x : drawingBox.x + drawingBox.w,
        y: drawingBox.h > 0 ? drawingBox.y : drawingBox.y + drawingBox.h,
        width: Math.abs(drawingBox.w),
        height: Math.abs(drawingBox.h),
      };
      setBoxes([...boxes, newBox]);
    }
    setDrawingBox(null);
  };

  const deleteBox = (id: string) => {
    setBoxes(boxes.filter(b => b.id !== id));
  };

  const finalizeCards = () => {
    if (!selectedImage || boxes.length === 0) return;

    const newCards: Flashcard[] = boxes.map((targetBox, index) => ({
      id: uuidv4(),
      type: "occlusion",
      question: `Identify the hidden part in the diagram (Part ${index + 1})`,
      answer: "Revealed diagram part",
      imageSrc: selectedImage,
      occlusionBoxes: boxes,
      targetBoxId: targetBox.id
    }));

    onCardsGenerated(newCards);
    // Reset
    setStep("upload");
    setPdfDoc(null);
    setSelectedImage(null);
    setBoxes([]);
  };

  return (
    <Card className="border-t-4 border-t-purple-600 shadow-xl overflow-hidden">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-2xl">Image Occlusion Generator</CardTitle>
            <CardDescription>
              Extract diagrams from PDF and create active recall flashcards.
            </CardDescription>
          </div>
          {step !== "upload" && (
             <Button variant="ghost" onClick={() => setStep("upload")}>Reset</Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <AnimatePresence mode="wait">
          {step === "upload" && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-12 flex flex-col items-center justify-center text-center"
            >
              <div className="w-20 h-20 rounded-full bg-purple-100 flex items-center justify-center mb-6">
                <Upload className="w-10 h-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Upload your PDF</h3>
              <p className="text-muted-foreground mb-8 max-w-sm">
                Select a PDF chapter. You can navigate through pages to find the perfect diagram.
              </p>
              <div className="relative">
                <Input 
                  type="file" 
                  accept=".pdf" 
                  onChange={handleFileUpload}
                  className="hidden" 
                  id="pdf-upload"
                  disabled={isProcessing}
                />
                <Button asChild size="lg" className="bg-purple-600 hover:bg-purple-700">
                  <label htmlFor="pdf-upload" className="cursor-pointer">
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Choose PDF File
                  </label>
                </Button>
              </div>
            </motion.div>
          )}

          {step === "select-page" && (
            <motion.div 
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="w-full bg-muted/30 p-4 border-y flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1 || isProcessing}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-medium">Page {currentPage} of {numPages}</span>
                  <Button 
                    variant="outline" 
                    size="icon" 
                    onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                    disabled={currentPage === numPages || isProcessing}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
                <Button onClick={capturePage} className="bg-purple-600 hover:bg-purple-700">
                  <Crop className="mr-2 w-4 h-4" /> Use This Page
                </Button>
              </div>
              
              <div className="relative w-full max-h-[600px] overflow-auto p-4 bg-gray-900 flex justify-center">
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 z-10 backdrop-blur-sm">
                    <Loader2 className="w-10 h-10 text-white animate-spin" />
                  </div>
                )}
                <canvas ref={canvasRef} className="shadow-2xl bg-white" />
              </div>
            </motion.div>
          )}

          {step === "edit-boxes" && selectedImage && (
            <motion.div 
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6"
            >
              <div className="mb-4 flex flex-wrap gap-4 items-center justify-between">
                <div>
                   <h4 className="font-semibold text-lg">Draw Occlusion Boxes</h4>
                   <p className="text-sm text-muted-foreground">Click and drag on the image to hide labels or parts.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setBoxes([])} disabled={boxes.length === 0}>
                    <Trash2 className="w-4 h-4 mr-2" /> Clear All
                  </Button>
                  <Button onClick={finalizeCards} disabled={boxes.length === 0} className="bg-green-600 hover:bg-green-700">
                    <Save className="w-4 h-4 mr-2" /> Generate {boxes.length} Cards
                  </Button>
                </div>
              </div>

              <div 
                ref={containerRef}
                className="relative cursor-crosshair border-2 border-purple-200 rounded-lg overflow-hidden shadow-card"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
              >
                <img 
                  src={selectedImage} 
                  alt="Select area" 
                  className="w-full h-auto select-none" 
                  draggable={false}
                />
                
                {/* Existing Boxes */}
                {boxes.map((box) => (
                  <div
                    key={box.id}
                    className="absolute border-2 border-purple-600 bg-purple-500/30 group"
                    style={{
                      left: `${box.x}%`,
                      top: `${box.y}%`,
                      width: `${box.width}%`,
                      height: `${box.height}%`,
                    }}
                  >
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteBox(box.id); }}
                      className="absolute -top-3 -right-3 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="bg-purple-600 text-white text-[10px] px-1 rounded-sm">
                        {boxes.indexOf(box) + 1}
                      </span>
                    </div>
                  </div>
                ))}

                {/* Drawing Box */}
                {drawingBox && (
                  <div
                    className="absolute border-2 border-dashed border-purple-400 bg-purple-400/20"
                    style={{
                      left: `${drawingBox.w > 0 ? drawingBox.x : drawingBox.x + drawingBox.w}%`,
                      top: `${drawingBox.h > 0 ? drawingBox.y : drawingBox.y + drawingBox.h}%`,
                      width: `${Math.abs(drawingBox.w)}%`,
                      height: `${Math.abs(drawingBox.h)}%`,
                    }}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
