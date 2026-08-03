export function getGearTypeIcon(typeName) {
  switch (typeName) {
    case 'HeadGear':
      return '🧢'
    case 'ClothingGear':
      return '👕'
    case 'ShoesGear':
      return '👟'
    default:
      return null
  }
}

export function getGearIcon(gear) {
  return getGearTypeIcon(gear.gear.__typename)
}
