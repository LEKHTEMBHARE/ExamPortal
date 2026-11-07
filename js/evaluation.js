const mcqAnswerKeys = [0, 1, 1, 0, 0, 2, 0, 1, 1, 0, 1, 1, 0, 0, 0, 3, 0, 1, 0, 0];
const codingAnswerKeywords = [
  ['adults', '>= 18', 'sum(', 'len(', 'return'],
  ['float(', 'continue', 'try', 'except', 'return cleaned'],
];

export function isPhaseComplete(phase, answers) {
  if (phase === 1) {
    return Array.isArray(answers) && answers.length === 20
      && answers.every((answer) => Number.isInteger(answer) && answer >= 0 && answer < 4);
  }

  if (phase === 2 || phase === 3) {
    const requiredLength = phase === 2 ? 2 : 5;
    return Array.isArray(answers) && answers.length === requiredLength
      && answers.every((answer) => typeof answer === 'string' && answer.trim().length > 0);
  }

  return false;
}

export function evaluateAttempt(attempt) {
  const mcqAnswers = Array.isArray(attempt.mcqAnswers) ? attempt.mcqAnswers : [];
  const codingAnswers = Array.isArray(attempt.codingAnswers) ? attempt.codingAnswers : [];
  const oralAnswers = Array.isArray(attempt.oralAnswers) ? attempt.oralAnswers : [];

  const mcq = mcqAnswerKeys.reduce((marks, answer, index) => (
    marks + (mcqAnswers[index] === answer ? 2 : 0)
  ), 0);
  const coding = codingAnswerKeywords.reduce((marks, keywords, index) => {
    const answer = String(codingAnswers[index] || '').toLowerCase();
    const matched = keywords.filter((keyword) => answer.includes(keyword.toLowerCase())).length;
    return marks + Math.min(20, Math.round((matched / keywords.length) * 20));
  }, 0);
  const oral = oralAnswers.slice(0, 5).reduce((marks, answerText) => {
    const answer = String(answerText || '').trim();
    if (!answer) return marks;
    const words = answer.split(/\s+/).filter(Boolean).length;
    const normalized = answer.toLowerCase();
    let score = 0;
    if (words >= 20) score += 2;
    if (words >= 35) score += 1;
    if (normalized.includes('python') || normalized.includes('data') || normalized.includes('analysis')) score += 1;
    return marks + Math.min(4, score);
  }, 0);

  const totalMarks = Math.min(100, mcq + coding + oral);
  return {
    totalMarks,
    percentage: Math.round(totalMarks),
    breakdown: { mcq, coding, oral },
  };
}
