package engine

import (
	"strconv"
	"strings"
)

// fmtNum 格式化浮点数，去掉无意义的尾零。
func fmtNum(v float64) string {
	return strconv.FormatFloat(v, 'f', -1, 64)
}

// pct 格式化为百分比字符串（保留 2 位小数）。
func pct(v float64) string {
	s := strconv.FormatFloat(v, 'f', 2, 64)
	return strings.TrimRight(strings.TrimRight(s, "0"), ".")
}
