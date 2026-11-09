// Urgent wording in a report. It flags a concern for prompt human attention; it says nothing about how certain the evidence is.
const URGENT = /\b(its|it's|it is)? ?(going to|gonna|about to|will|might|could) (blow|explode|rupture|burst|go up|fail)\b|\b(blow(ing)? up|explod|imminent|emergency now)\b/i;
export const urgentWording = (text: string) => URGENT.test(text);
