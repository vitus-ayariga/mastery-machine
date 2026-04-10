"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateFlashcardsAction } from "@/app/actions";
import { Flashcard, Course, Deck } from "@/types/flashcard";
import { v4 as uuidv4 } from "uuid";
import DrillSession from "./DrillSession";
import { BrainCircuit, BookOpen, Loader2, Upload, LayoutDashboard, Plus, GraduationCap, FolderOpen } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { getCourses, createCourse, createDeck, saveFlashcards, getDecks, getFlashcards } from "@/lib/db";

// Configure PDF.js worker to use the local file in the public folder
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export default function FlashcardApp() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [inputText, setInputText] = useState("");
  const [fileData, setFileData] = useState<{base64: string, mimeType: string, name: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  
  // Organization State
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");
  const [newCourseName, setNewCourseName] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<Deck | null>(null);
  const [userDecks, setUserDecks] = useState<Deck[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);

  // Load Metadata (Courses)
  useEffect(() => {
    refreshCourses();
  }, []);

  const refreshCourses = async () => {
    setIsLoadingMetadata(true);
    try {
      const data = await getCourses();
      setCourses(data);
    } catch (e) {
      console.error("Failed to fetch courses", e);
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleCreateCourse = async () => {
    if (!newCourseName.trim()) return;
    try {
      const course = await createCourse(newCourseName);
      setCourses(prev => [...prev, course]);
      setSelectedCourseId(course.id);
      setNewCourseName("");
      setIsCreatingCourse(false);
    } catch (e: any) {
      if (e.message === "Supabase not configured") {
        alert("Action Required: Please add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local to enable course creation and cloud sync.");
      } else {
        alert("Failed to create course. It might already exist or there's a connection issue.");
      }
    }
  };

  const handleSelectDeckForDrill = async (deck: Deck) => {
    setIsLoadingMetadata(true);
    try {
      const cards = await getFlashcards(deck.id);
      setFlashcards(cards);
      setSelectedDeck(deck);
      setActiveTab("drill");
    } catch (e) {
      alert("Failed to load cards for this deck.");
    } finally {
      setIsLoadingMetadata(false);
    }
  };

  const handleGenerate = async () => {
    if (!inputText.trim() && !fileData) return;
    if (!selectedCourseId) { alert("Please select or create a course first."); return; }
    if (!chapterName.trim()) { alert("Please provide a name for this chapter/deck."); return; }
    
    setIsGenerating(true);
    try {
      // 1. Create the Deck in DB first
      const deck = await createDeck(selectedCourseId, chapterName);
      
      // 2. Generate content from AI
      const generatedData = await generateFlashcardsAction({
        text: inputText ? inputText : undefined,
        fileData: fileData ? { base64: fileData.base64, mimeType: fileData.mimeType } : undefined
      });

      // 3. Process image occlusion and map to final format
      const processedCards: Partial<Flashcard>[] = [];
      for (const card of generatedData) {
        const finalCard = { ...card };
        if (finalCard.type === 'occlusion' && finalCard.pageNumber && fileData) {
          try {
            finalCard.imageSrc = await extractPageAsImage(fileData.base64, finalCard.pageNumber);
          } catch (e) {
            console.error(`Failed to extract page ${finalCard.pageNumber}`, e);
          }
        }
        processedCards.push(finalCard);
      }
      
      // 4. Save to Supabase
      await saveFlashcards(deck.id, processedCards);
      
      // 5. Load the deck for drilling immediately
      await handleSelectDeckForDrill(deck);
      setChapterName("");
      setInputText("");
      setFileData(null);
    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const extractPageAsImage = async (pdfBase64: string, pageNumber: number): Promise<string> => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    const arrayBuffer = Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0)).buffer;
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error("Could not get canvas context");
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    return canvas.toDataURL('image/png');
  };

  const handlePDFUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { setFileData(null); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const dataUrl = e.target.result as string;
        const [metaData, base64Data] = dataUrl.split(',');
        const mimeTypeMatch = metaData.match(/:(.*?);/);
        setFileData({
          base64: base64Data,
          mimeType: mimeTypeMatch ? mimeTypeMatch[1] : file.type,
          name: file.name
        });
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="container mx-auto max-w-5xl py-12 px-4 min-h-screen">
      <div className="mb-10 text-center animate-in fade-in slide-in-from-top-4 duration-700">
        <h1 className="text-5xl font-black tracking-tight mb-4 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          Mastery Machine
        </h1>
        <p className="text-muted-foreground text-xl font-medium">
          The ultimate active recall ecosystem.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-10 h-14 p-1 bg-muted/40 backdrop-blur-md rounded-2xl border">
          <TabsTrigger value="dashboard" className="text-base rounded-xl transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <LayoutDashboard className="w-4 h-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="generate" className="text-base rounded-xl transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BrainCircuit className="w-4 h-4 mr-2" />
            Generate
          </TabsTrigger>
          <TabsTrigger value="drill" className="text-base rounded-xl transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BookOpen className="w-4 h-4 mr-2" />
            Study Drill
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-1 border-none shadow-premium bg-gradient-to-b from-indigo-50 to-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GraduationCap className="w-5 h-5 text-indigo-600" />
                  Your Courses
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingMetadata ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
                ) : (
                  <>
                    <div className="space-y-2">
                      {courses.map(course => (
                        <Button 
                          key={course.id}
                          variant={selectedCourseId === course.id ? "default" : "outline"}
                          className="w-full justify-start text-left h-12 rounded-xl"
                          onClick={async () => {
                            setSelectedCourseId(course.id);
                            const decks = await getDecks(course.id);
                            setUserDecks(decks);
                          }}
                        >
                          {course.name}
                        </Button>
                      ))}
                    </div>
                    {isCreatingCourse ? (
                      <div className="space-y-2 pt-4 border-t">
                        <Input 
                          placeholder="Course name (e.g. Physics)" 
                          value={newCourseName}
                          onChange={e => setNewCourseName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleCreateCourse()}
                        />
                        <div className="flex gap-2">
                          <Button className="flex-1" size="sm" onClick={handleCreateCourse}>Create</Button>
                          <Button className="flex-1" size="sm" variant="ghost" onClick={() => setIsCreatingCourse(false)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="ghost" className="w-full border-dashed border-2 h-12 rounded-xl text-indigo-600 hover:bg-indigo-50" onClick={() => setIsCreatingCourse(true)}>
                        <Plus className="w-4 h-4 mr-2" /> New Course
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="md:col-span-2 space-y-6">
              {selectedCourseId ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-right-4">
                  {userDecks.length === 0 ? (
                    <div className="col-span-full h-80 flex flex-col items-center justify-center bg-muted/20 rounded-3xl border border-dashed p-8 text-center">
                      <FolderOpen className="w-12 h-12 text-muted-foreground/30 mb-4" />
                      <h3 className="text-xl font-semibold mb-2 text-muted-foreground">No chapters yet</h3>
                      <p className="text-muted-foreground max-w-xs mb-6">Start by generating some cards for this course.</p>
                      <Button onClick={() => setActiveTab("generate")} className="rounded-full px-6">Generate First Deck</Button>
                    </div>
                  ) : (
                    userDecks.map(deck => (
                      <Card 
                        key={deck.id} 
                        className="group hover:border-indigo-400 cursor-pointer transition-all shadow-premium hover:shadow-indigo-100 rounded-3xl overflow-hidden"
                        onClick={() => handleSelectDeckForDrill(deck)}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg truncate">{deck.name}</CardTitle>
                          <CardDescription>Created {new Date(deck.created_at).toLocaleDateString()}</CardDescription>
                        </CardHeader>
                        <CardFooter className="bg-muted/30 py-3 flex justify-between items-center group-hover:bg-indigo-50/50">
                          <span className="text-xs font-bold text-muted-foreground group-hover:text-indigo-600">CLICK TO DRILL</span>
                          <BookOpen className="w-4 h-4 text-muted-foreground group-hover:text-indigo-600" />
                        </CardFooter>
                      </Card>
                    ))
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-muted/10 rounded-3xl border border-dashed border-muted p-12 text-center text-muted-foreground">
                  <GraduationCap className="w-16 h-16 mb-6 opacity-10" />
                  <p className="text-lg">Select a course on the left to see your study chapters.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="generate">
          <Card className="border-none shadow-premium rounded-[2.5rem] overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 w-full" />
            <CardHeader className="p-8 pb-4">
              <CardTitle className="text-3xl">AI Brain Dump</CardTitle>
              <CardDescription className="text-base">
                Transform any learning material into a structured mastery deck.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-4 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6 bg-slate-50/80 rounded-3xl border border-slate-100">
                <div className="space-y-4">
                  <Label className="text-base font-bold text-slate-700">1. Destination</Label>
                  <div className="space-y-3">
                    <Select value={selectedCourseId} onValueChange={(val) => setSelectedCourseId(val || "")}>
                      <SelectTrigger className="h-12 rounded-xl bg-white border-2 border-slate-200">
                        <SelectValue placeholder="Which course is this for?" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses.map(course => (
                          <SelectItem key={course.id} value={course.id}>{course.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input 
                      placeholder="Chapter name (e.g. Thermodynamics Part 1)" 
                      className="h-12 rounded-xl bg-white border-2 border-slate-200"
                      value={chapterName}
                      onChange={e => setChapterName(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="space-y-4">
                  <Label className="text-base font-bold text-slate-700">2. Source Material</Label>
                  <div className="flex flex-col gap-3">
                    <Input 
                      type="file" 
                      accept=".txt,.pdf" 
                      onChange={handlePDFUpload}
                      className="cursor-pointer file:text-primary file:font-bold h-12 border-2 border-slate-200 bg-white"
                    />
                    {fileData && (
                      <p className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3 h-3" /> PDF ready: {fileData.name}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="space-y-3">
                <Label className="text-base font-bold text-slate-700">3. Raw Input (Optional if PDF is uploaded)</Label>
                <Textarea
                  placeholder="Paste text snippets, definitions, or notes here..."
                  className="min-h-[220px] resize-none text-base rounded-2xl border-2 border-slate-200 focus:border-indigo-400 p-4 transition-all"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={!!fileData}
                />
              </div>
              
              <Button 
                size="lg" 
                className="w-full text-xl font-bold h-16 rounded-2xl shadow-indigo-200 shadow-xl hover:shadow-2xl transition-all bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-1 active:scale-[0.98]"
                onClick={handleGenerate}
                disabled={isGenerating || (!inputText.trim() && !fileData)}
              >
                {isGenerating ? (
                   <>
                     <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                     Forging Neural Pathways...
                   </>
                ) : (
                  "Generate Mastery Deck"
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="drill">
          {!selectedDeck ? (
            <div className="h-[500px] flex flex-col items-center justify-center bg-muted/10 rounded-[3rem] border border-dashed p-12 text-center">
              <BookOpen className="w-20 h-20 mb-6 text-indigo-200" />
              <h2 className="text-2xl font-bold mb-2">No active drill</h2>
              <p className="text-muted-foreground mb-8 max-w-md">Pick a chapter from the dashboard to start mastering it, or generate a new one.</p>
              <Button onClick={() => setActiveTab("dashboard")} className="rounded-full px-8 h-12 text-base shadow-lg">Go to Dashboard</Button>
            </div>
          ) : (
            <div className="animate-in fade-in zoom-in-95 duration-500">
               <div className="mb-6 flex justify-between items-center bg-white p-4 rounded-2xl shadow-premium border">
                 <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                       <GraduationCap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-bold">{selectedDeck.name}</h3>
                      <p className="text-xs text-muted-foreground uppercase tracking-widest">Mastery Session</p>
                    </div>
                 </div>
                 <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setSelectedDeck(null)}>Switch Deck</Button>
               </div>
               <DrillSession 
                cards={flashcards} 
                onClearCards={() => setFlashcards([])} 
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Simple internal icon component for consistency
function Check({ className }: { className?: string }) {
  return (
    <svg 
      className={className} 
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor" 
      strokeWidth={3}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
