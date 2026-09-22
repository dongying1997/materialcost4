package models

import "testing"

// TestNormalizePriceScale 覆盖「标准值直通 / 常见等价写法归一 / 空串与无法识别原样返回」三类。
func TestNormalizePriceScale(t *testing.T) {
	cases := []struct{ in, want string }{
		// 标准值原样返回（含空串：未填写是合法状态）
		{"", ""},
		{PriceScaleKg, PriceScaleKg},
		{PriceScaleTenKg, PriceScaleTenKg},
		{PriceScaleHundredKg, PriceScaleHundredKg},
		{PriceScaleTon, PriceScaleTon},
		{"  吨  ", PriceScaleTon},
		// 等价写法归一
		{"kg", PriceScaleKg},
		{"KG", PriceScaleKg},
		{"公斤", PriceScaleKg},
		{"10kg", PriceScaleTenKg},
		{"十公斤", PriceScaleTenKg},
		{"100千克", PriceScaleHundredKg},
		{"1吨", PriceScaleTon},
		{"t", PriceScaleTon},
		{"Tonnes", PriceScaleTon},
		{"  1 吨  ", PriceScaleTon},
		{"2kg", PriceScaleKg},
		{"20kg", PriceScaleTenKg},
		{"2t", PriceScaleTon},
		{"1 吨", PriceScaleTon},
		// 认不出的写法原样返回，由调用方决定是报错还是忽略
		{"箱", "箱"},
	}
	for _, c := range cases {
		if got := NormalizePriceScale(c.in); got != c.want {
			t.Errorf("NormalizePriceScale(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestIsPriceScale 校验合法取值判定：空串合法，未归一化的写法非法。
func TestIsPriceScale(t *testing.T) {
	for _, v := range PriceScales {
		if !IsPriceScale(v) {
			t.Errorf("IsPriceScale(%q) = false, want true", v)
		}
	}
	for _, v := range []string{"kg", "1吨", "箱"} {
		if IsPriceScale(v) {
			t.Errorf("IsPriceScale(%q) = true, want false（应先用 NormalizePriceScale 归一）", v)
		}
	}
}
