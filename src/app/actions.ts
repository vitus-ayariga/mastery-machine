"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";

export async function generateFlashcardsAction(payload: { text?: string, fileData?: { base64: string, mimeType: string } }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY environment variable. Please add it to your .env.local file.");
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim().replace(/^["']|["']$/g, '');
  const ai = new GoogleGenerativeAI(apiKey);
  // Note: If you continue to see 404, we might need to specify the API version or check model availability.

  const prompt = `
You are an expert, meticulous educator. You are given a comprehensive chapter.
Your task is to analyze the entire document and generate an exhaustive set of flashcards covering all important concepts, formulas, definitions, diagrams, and nuances.

Generate an incredibly diverse set of flashcards using these 6 types:
1. "qa": Simple Q&A. (Fields: type, question, answer)
2. "blanks": 'Fill-in-the-blank' / Cloze Deletions. (Fields: type, question (with blanks like ____), answer)
3. "equation": Equations using LaTeX. (Fields: type, question, answer (LaTeX string))
4. "mcq": Multiple Choice. (Fields: type, question, options (array of 4 strings), answer (the correct string))
5. "context": 'Context' cards. Large snippets with important blanks. (Fields: type, question, answer)
6. "occlusion": Image Occlusion for diagrams.
   - If you see a diagram with labels or parts, create occlusion cards for it.
   - Fields: 
     - type: "occlusion"
     - question: "Identify the indicated part in this diagram."
     - answer: The specific name/label of the hidden part.
     - pageNumber: The page number where this diagram appears (1-indexed).
     - occlusionBoxes: An array of all labels in this diagram. Each box: {id: string, x: number, y: number, width: number, height: number}.
       *Coordinates must be percentages (0-100) relative to the page.*
     - targetBoxId: The ID of the specific box being tested in this card.

IMPORTANT for 'occlusion':
- Identify ACTUAL diagrams in the PDF.
- If there are no diagrams, do not generate 'occlusion' cards.
- Generate one 'occlusion' card for EACH label/part of a diagram so the user can study each one.

Output ONLY a valid JSON array of objects.
Target 25 - 60 cards for stability.
${payload.text ? `\nTarget Text:\n${payload.text}` : ''}
  `;

  try {
    const parts: any[] = [];
    if (payload.fileData) {
       parts.push({
         inlineData: {
           data: payload.fileData.base64,
           mimeType: payload.fileData.mimeType
         }
       });
    }
    parts.push({ text: prompt });

    const model = ai.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      systemInstruction: "You strictly output a valid JSON array of flashcard objects.",
      // @ts-ignore - Gemini 3 specific parameter (2026)
      thinkingConfig: { 
        thinkingLevel: "low", 
        includeThoughts: false 
      }
    }, { apiVersion: "v1beta", timeout: 300000 }); // 5 minute timeout to avoid deadline expired error

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const response = await result.response;
    const jsonText = response.text();
    if (!jsonText) throw new Error("No text response from Gemini.");
    
    try {
      const cleanedJson = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanedJson);
    } catch (parseError) {
      console.error("Failed to parse JSON. Raw response was:", jsonText);
      throw new Error("Gemini returned invalid JSON. Please try again with a shorter section of the document.");
    }
  } catch (error: any) {
    console.error("GenAI Error:", error);
    throw new Error(error.message || "Failed to generate flashcards.");
  }
}
