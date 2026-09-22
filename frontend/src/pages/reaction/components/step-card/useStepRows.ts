// 步骤卡内的行级操作：原料行 / 产物行的增删改与底物、主产物标记。
// 外壳的「添加原料」「继承产物」按钮与两张表共用这一份写法。
import type { StepRow, ReagentRow, ProductRow, IntermediateProduct } from '@/types';
import { normalize } from '@/shared/utils/decimal';

interface Options {
  step: StepRow;
  onChange: (step: StepRow) => void;
  /** 上一步的主产物，供「继承产物」按钮使用 */
  prevProduct?: IntermediateProduct | null;
}

export function useStepRows({ step, onChange, prevProduct }: Options) {
  const updateReagent = (key: string, patch: Partial<ReagentRow>) => {
    onChange({ ...step, reagents: step.reagents.map((r) => (r._key === key ? { ...r, ...patch } : r)) });
  };
  const updateProduct = (key: string, patch: Partial<ProductRow>) => {
    onChange({ ...step, products: step.products.map((p) => (p._key === key ? { ...p, ...patch } : p)) });
  };
  const markSubstrate = (key: string) => {
    // 底物是 1 eq 基准：标记时把当量固定为 1，避免残留旧当量
    onChange({
      ...step,
      reagents: step.reagents.map((r) =>
        r._key === key ? { ...r, isSubstrate: true, equiv: '1' } : { ...r, isSubstrate: false },
      ),
    });
  };
  const markPrimary = (key: string) => {
    onChange({ ...step, products: step.products.map((p) => ({ ...p, isSubstrate: p._key === key })) });
  };
  const addReagent = () => {
    onChange({
      ...step,
      reagents: [
        ...step.reagents,
        {
          _key: `r${Math.random().toString(36).slice(2)}`,
          materialId: 0,
          inherited: false,
          name: '',
          cas: '',
          formula: '',
          molWeight: '0',
          content: '100',
          recoveryRate: '0',
          isSubstrate: step.reagents.length === 0,
          equiv: null,
          amountKg: null,
          price: null,
          priceOptions: [],
          latestPrice: null,
        },
      ],
    });
  };
  const addInherited = () => {
    const key = `r${Math.random().toString(36).slice(2)}`;
    const inheritedRow: ReagentRow = {
      _key: key,
      materialId: 0,
      inherited: true,
      name: prevProduct?.name || '（继承上一步产物）',
      cas: '',
      formula: '',
      molWeight: normalize(prevProduct?.molWeight) ?? '0',
      content: '100',
      recoveryRate: '0',
      isSubstrate: step.reagents.length === 0,
      equiv: null,
      amountKg: null,
      price: null,
      priceOptions: [],
      latestPrice: null,
    };
    const reagents = [...step.reagents];
    const last = reagents[reagents.length - 1];
    // 最后一行是空白行（未选物料/未填数据）时直接替代，避免残留空白行
    if (last && !last.inherited && !last.materialId && !last.name && !last.equiv && !last.amountKg) {
      // 底物固定 1 eq，其余保持继承行的空当量
      reagents[reagents.length - 1] = {
        ...last,
        ...inheritedRow,
        _key: last._key,
        isSubstrate: last.isSubstrate,
        equiv: last.isSubstrate ? '1' : null,
      };
    } else {
      reagents.push(inheritedRow);
    }
    onChange({ ...step, reagents });
  };
  const removeReagent = (key: string) => {
    onChange({ ...step, reagents: step.reagents.filter((r) => r._key !== key) });
  };
  const removeProduct = (key: string) => {
    onChange({ ...step, products: step.products.filter((p) => p._key !== key) });
  };

  return {
    updateReagent,
    updateProduct,
    markSubstrate,
    markPrimary,
    addReagent,
    addInherited,
    removeReagent,
    removeProduct,
  };
}
