import { supabase } from './supabase';
import { Course, Deck, Flashcard } from '@/types/flashcard';

export async function getCourses() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .order('name');
  if (error) throw error;
  return data as Course[];
}

export async function createCourse(name: string) {
  if (!supabase) throw new Error("Supabase not configured");
  
  // Try to find existing first
  const { data: existing, error: findError } = await supabase
    .from('courses')
    .select('*')
    .eq('name', name)
    .maybeSingle();
    
  if (findError) throw findError;
  if (existing) return existing as Course;

  const { data, error } = await supabase
    .from('courses')
    .insert([{ name }])
    .select()
    .single();
    
  if (error) throw error;
  return data as Course;
}

export async function getDecks(courseId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('course_id', courseId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Deck[];
}

export async function createDeck(courseId: string, name: string) {
  if (!supabase) throw new Error("Supabase not configured");
  
  // First, try to find an existing deck with this name
  const { data: existingDeck, error: findError } = await supabase
    .from('decks')
    .select('*')
    .eq('course_id', courseId)
    .eq('name', name)
    .maybeSingle();

  if (findError) throw findError;
  if (existingDeck) return existingDeck as Deck;

  // If not found, create a new one
  const { data, error } = await supabase
    .from('decks')
    .insert([{ course_id: courseId, name }])
    .select()
    .single();
  
  if (error) throw error;
  return data as Deck;
}

export async function saveFlashcards(deckId: string, cards: Partial<Flashcard>[]) {
  if (!supabase) throw new Error("Supabase not configured");
  const formattedCards = cards.map(card => ({
    deck_id: deckId,
    type: card.type,
    question: card.question,
    answer: card.answer,
    image_src: card.imageSrc,
    occlusion_boxes: card.occlusionBoxes,
    target_box_id: card.targetBoxId,
    page_number: card.pageNumber,
    options: card.options,
    bucket: 0,
    next_review: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from('flashcards')
    .insert(formattedCards)
    .select();
  if (error) throw error;
  return data;
}

export async function getFlashcards(deckId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('flashcards')
    .select('*')
    .eq('deck_id', deckId)
    .order('created_at');
  if (error) throw error;
  
  // Map back to our camelCase interface
  return data.map(item => ({
    id: item.id,
    deck_id: item.deck_id,
    type: item.type,
    question: item.question,
    answer: item.answer,
    imageSrc: item.image_src,
    occlusionBoxes: item.occlusion_boxes,
    targetBoxId: item.target_box_id,
    pageNumber: item.page_number,
    options: item.options,
    bucket: item.bucket,
    nextReview: item.next_review
  })) as Flashcard[];
}

export async function updateFlashcardMastery(cardId: string, bucket: number, nextReview: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from('flashcards')
    .update({ bucket, next_review: nextReview })
    .eq('id', cardId);
  if (error) throw error;
}
export async function deleteDeck(deckId: string) {
  if (!supabase) throw new Error("Supabase not configured");
  const { error } = await supabase
    .from('decks')
    .delete()
    .eq('id', deckId);
  if (error) throw error;
}
