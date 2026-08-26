// Package service 提供业务服务层，通过 Wails 绑定暴露给前端。
package service

import (
	"fmt"
	"strings"
)

// PriceToYuanPerKg 将价格记录换算为 元/kg。
// - 元/g  → ×1000
// - 元/mol → ×1000 ÷ 分子量（需要分子量）
// - 元/kg  → 不变
// 返回换算结果与可能存在的警告。
func PriceToYuanPerKg(price float64, unit string, molWeight float64) (float64, string) {
	switch strings.TrimSpace(unit) {
	case "元/g":
		return price * 1000, ""
	case "元/mol":
		if molWeight <= 0 {
			return 0, "价格为 元/mol 但缺少分子量，无法换算"
		}
		return price * 1000 / molWeight, ""
	default: // 元/kg
		return price, ""
	}
}

// FormatMoney 格式化金额（千分位）。
func FormatMoney(v float64) string {
	if v == 0 {
		return "0.00"
	}
	s := fmt.Sprintf("%.2f", v)
	neg := strings.HasPrefix(s, "-")
	if neg {
		s = s[1:]
	}
	parts := strings.Split(s, ".")
	intPart := parts[0]
	var b []byte
	n := len(intPart)
	for i := 0; i < n; i++ {
		if i > 0 && (n-i)%3 == 0 {
			b = append(b, ',')
		}
		b = append(b, intPart[i])
	}
	out := string(b)
	if len(parts) > 1 {
		out += "." + parts[1]
	}
	if neg {
		out = "-" + out
	}
	return out
}
