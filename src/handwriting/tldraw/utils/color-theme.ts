import type { TLDefaultColorStyle } from '@tldraw/tldraw'

type LegacyThemeEntry = {
	solid: string
	semi: string
}

export type LegacyColorTheme = Record<TLDefaultColorStyle, LegacyThemeEntry> & {
	background: string
}

const lightTheme: LegacyColorTheme = {
	background: '#ffffff',
	white: { solid: '#ffffff', semi: 'rgba(255, 255, 255, 0.22)' },
	black: { solid: '#1e1e1e', semi: 'rgba(30, 30, 30, 0.14)' },
	grey: { solid: '#808080', semi: 'rgba(128, 128, 128, 0.16)' },
	'light-violet': { solid: '#b197fc', semi: 'rgba(177, 151, 252, 0.22)' },
	violet: { solid: '#673ab7', semi: 'rgba(103, 58, 183, 0.18)' },
	blue: { solid: '#1971c2', semi: 'rgba(25, 113, 194, 0.18)' },
	'light-blue': { solid: '#74c0fc', semi: 'rgba(116, 192, 252, 0.22)' },
	yellow: { solid: '#fadc46', semi: 'rgba(250, 220, 70, 0.24)' },
	orange: { solid: '#f59f00', semi: 'rgba(245, 159, 0, 0.22)' },
	green: { solid: '#2f9e44', semi: 'rgba(47, 158, 68, 0.18)' },
	'light-green': { solid: '#8ce99a', semi: 'rgba(140, 233, 154, 0.22)' },
	'light-red': { solid: '#ff8787', semi: 'rgba(255, 135, 135, 0.24)' },
	red: { solid: '#e03131', semi: 'rgba(224, 49, 49, 0.18)' },
}

const darkTheme: LegacyColorTheme = {
	background: '#1f1f1f',
	white: { solid: '#ffffff', semi: 'rgba(255, 255, 255, 0.22)' },
	black: { solid: '#f3f3f3', semi: 'rgba(243, 243, 243, 0.16)' },
	grey: { solid: '#c8c8c8', semi: 'rgba(200, 200, 200, 0.16)' },
	'light-violet': { solid: '#cfbfff', semi: 'rgba(207, 191, 255, 0.18)' },
	violet: { solid: '#b89cff', semi: 'rgba(184, 156, 255, 0.2)' },
	blue: { solid: '#7db8ff', semi: 'rgba(125, 184, 255, 0.18)' },
	'light-blue': { solid: '#9ad5ff', semi: 'rgba(154, 213, 255, 0.2)' },
	yellow: { solid: '#ffe27a', semi: 'rgba(255, 226, 122, 0.2)' },
	orange: { solid: '#ffc266', semi: 'rgba(255, 194, 102, 0.2)' },
	green: { solid: '#66d98a', semi: 'rgba(102, 217, 138, 0.18)' },
	'light-green': { solid: '#b8f5c2', semi: 'rgba(184, 245, 194, 0.2)' },
	'light-red': { solid: '#ffb0b0', semi: 'rgba(255, 176, 176, 0.22)' },
	red: { solid: '#ff7f7f', semi: 'rgba(255, 127, 127, 0.2)' },
}

export function getDefaultColorTheme(options: { isDarkMode: boolean }): LegacyColorTheme {
	return options.isDarkMode ? darkTheme : lightTheme
}
