export type FlashcardType = 'qa' | 'blanks' | 'equation' | 'visual' | 'context' | 'occlusion' | 'mcq';

export interface Course {
  id: string;
  name: string;
  created_at: string;
}

export interface Deck {
  id: string;
  course_id: string;
  name: string;
  created_at: string;
}

export interface OcclusionBox {
  id: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  width: number; // Percentage 0-100
  height: number; // Percentage 0-100
}

export interface Flashcard {
  id: string;
  deck_id?: string;
  type: FlashcardType;
  question: string;
  answer: string;
  
  // Custom fields for Image Occlusion
  imageSrc?: string; // Base64 data URL
  occlusionBoxes?: OcclusionBox[];
  targetBoxId?: string; // The box being tested in this specific card
  pageNumber?: number; // Page in the original PDF
  options?: string[]; // For MCQ

  // Mastery State
  bucket?: number;
  nextReview?: string; // ISO String
}
