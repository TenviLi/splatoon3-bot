export function ruPluralization(choice, choicesLength) {
  const hasExplicitZeroForm = choicesLength >= 4
  if (choice === 0) {
    return hasExplicitZeroForm ? 0 : 2
  }

  const teen = choice > 10 && choice < 20
  const endsWithOne = choice % 10 === 1
  if (!teen && endsWithOne) {
    return hasExplicitZeroForm ? 1 : 0
  }
  if (!teen && choice % 10 >= 2 && choice % 10 <= 4) {
    return hasExplicitZeroForm ? 2 : 1
  }

  return hasExplicitZeroForm ? 3 : 2
}

export const pluralRules = Object.freeze({
  'ru-RU': ruPluralization,
})
