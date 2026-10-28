import type { LessonDraft } from '../curriculum'
export const L = (title: string, module: string, goal: string, explanation: string, example: string, walkthrough: string[], mistake: string, exercise: string, acceptance: string, question: string, options: string[], answer: number, rationale: string): LessonDraft => ({ title, module, goal, explanation, example, walkthrough, mistake, exercise, acceptance, question, options, answer, rationale })

