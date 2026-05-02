---
title: types/inspectorSchema — Inspector 表单的 schema 驱动模型
description: 数据驱动 SchemaForm 渲染 Lane / Junction / 等表单的核心模型；FieldDef 自带 read/write 适配器，配合 LaneInspectorSchema 实现 JSX-per-entity 替换。
---

# `types/inspectorSchema` — Inspector 表单的 schema 驱动模型

> 源码：`src/types/inspectorSchema.ts` · 541 行 · React + zod 集成

## 用途

在此模块出现之前，`InspectorForms.tsx` 为每种实体硬编码一份 React 表单（Lane / Junction / Parking / Signal / StopSign）。新增实体或字段需要改 5 处 JSX。

`inspectorSchema` 引入数据驱动模型——一份 `EntitySchema` 描述一个实体的所有字段，`SchemaForm` 通用组件按 schema 渲染。

设计要点（来自源码注释）：

1. **Adapter 模式（read/write）而非 fieldPath**——naive 实现 `entity[fieldName] = value` 表达不了 `leftWidth`（统一改写所有 leftSamples 的 width）或 `leftBoundaryType`（嵌套 boundaryType 数组的首元素）。每个 FieldDef 显式带 `read` / `write` 适配器。
2. **双重泛型 `<TEntity, TFormValues>`**——`name` 被约束到 `keyof TFormValues`，编译期捕获 typo。
3. **保留 validation 闸门**——`validation` 直接是 zod schema，喂给 `useForm`，保留旧 `LaneForm` 的 onChange 校验语义。

## 公共 API

| 符号                                   | 类型      | 摘要                                                      |
| -------------------------------------- | --------- | --------------------------------------------------------- |
| `NumberFieldDef<...>`                  | interface | 数字输入字段                                              |
| `EnumFieldDef<...>`                    | interface | 枚举选择字段                                              |
| `FieldDef<TEntity, TFormValues, TKey>` | union     | NumberFieldDef \| EnumFieldDef                            |
| `AnyFieldDef<TEntity, TFormValues>`    | type      | 分布展开后的 FieldDef union                               |
| `ReadOnlyDef<TEntity>`                 | interface | 只读派生行                                                |
| `EntitySchema<TEntity, TFormValues>`   | interface | 一个 Inspector 面板的完整 schema                          |
| `fieldBuilder<TEntity, TFormValues>()` | fn        | 柯里化构造器，自动推断 TKey                               |
| `LaneInspectorSchema`                  | const     | Lane 表单的具体 schema                                    |
| `formValuesFromEntity`                 | fn        | 通过 `read` 投影 entity → form values                     |
| `diffFormAgainstEntity`                | fn        | 计算需要回写的字段集合                                    |
| `shouldPersistForm`                    | fn        | 是否有 diff（`updateEntity` 闸门）                        |
| `applyFormValuesToEntity`              | fn        | 通过 `write` 把表单值写回 entity，并更新 `_userOverrides` |

## 详细条目

### `NumberFieldDef<TEntity, TFormValues, TKey>`

```ts
export interface NumberFieldDef<
  TEntity extends MapEntity,
  TFormValues,
  TKey extends keyof TFormValues,
> {
  kind: 'number';
  name: TKey;
  label: string;
  section: string;
  min?: number;
  max?: number;
  step?: number;
  /** 从派生后的 entity 读取表单值。 */
  read: (entity: TEntity) => TFormValues[TKey];
  /** 把表单值写回 entity（含派生）。 */
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
  /**
   * 该字段"拥有"的 entity 字段路径——写入后会被推到 `_userOverrides`,
   * derive 规则的 `owns` 与之相交时会被跳过。默认 `[name]`。
   */
  overridesPaths?: readonly string[];
}
```

文件位置：`inspectorSchema.ts:62-86`。

### `EnumFieldDef<TEntity, TFormValues, TKey>`

```ts
export interface EnumFieldDef<...> {
  kind: 'enum';
  name: TKey;
  label: string;
  section: string;
  options: readonly string[];
  enumCategory?: EnumCategory;  // 给 getEnumLabel 用
  read: (entity: TEntity) => TFormValues[TKey];
  write: (entity: TEntity, value: TFormValues[TKey]) => TEntity;
  overridesPaths?: readonly string[];
}
```

`enumCategory` 让 `<Select>` 在不改变 wire 值的前提下显示本地化标签——单一 i18n 注入点。

### `FieldDef<TEntity, TFormValues, TKey>` & `AnyFieldDef`

```ts
export type FieldDef<...> = NumberFieldDef<...> | EnumFieldDef<...>;

export type AnyFieldDef<TEntity, TFormValues> = {
  [K in keyof TFormValues]-?: FieldDef<TEntity, TFormValues, K>;
}[keyof TFormValues];
```

`AnyFieldDef` 是分布式 union ——避免数组字面量把 `read` / `write` 的值类型扩成"所有可能字段类型的 union"。

### `ReadOnlyDef<TEntity>`

```ts
export interface ReadOnlyDef<TEntity extends MapEntity> {
  kind: 'readonly';
  label: string;
  section: string;
  compute: (entity: TEntity) => React.ReactNode;
}
```

无表单绑定、无 validation——纯展示。例：Lane.length（米）、predecessorIds 列表。`compute` 可返回任意 React node（包括 `<LaneRefList>` 这种带跳转的组件）。

### `EntitySchema<TEntity, TFormValues>`

```ts
export interface EntitySchema<
  TEntity extends MapEntity,
  TFormValues extends Record<string, unknown>,
> {
  id: string;
  fields: ReadonlyArray<AnyFieldDef<TEntity, TFormValues>>;
  readonly: ReadonlyArray<ReadOnlyDef<TEntity>>;
  validation: ZodType<TFormValues, TFormValues>;
  sectionOrder: ReadonlyArray<string>;
}
```

- `id` —— 用于 React key，切换实体时强制重建表单
- `fields` —— 编辑行
- `readonly` —— 只读行
- `validation` —— `useForm` 的 zod resolver
- `sectionOrder` —— 分区渲染顺序，未列出的按声明顺序追加

### `fieldBuilder<TEntity, TFormValues>()`

柯里化构造器：

```ts
export function fieldBuilder<TEntity, TFormValues>() {
  return {
    field<TKey extends keyof TFormValues>(
      def: FieldDef<TEntity, TFormValues, TKey>,
    ): FieldDef<TEntity, TFormValues, TKey> {
      return def;
    },
  };
}
```

设计动机：`defineField<TEntity, TFormValues, TKey>(def)` 让 caller 必须显式传 `TKey`，无法从单个参数推断。柯里化把 `TEntity, TFormValues` 在 builder 层 pin 死，每次 `.field({...})` 调用就只剩 TKey 待推。

```ts
const F = fieldBuilder<LaneEntity, LaneFormValues>();
F.field({ kind: 'number', name: 'speedLimit', read, write, ... });
```

### `LaneInspectorSchema`

```ts
export const LaneInspectorSchema: EntitySchema<LaneEntity, LaneFormValues> = {
  id: 'lane',
  validation: laneSchema,
  sectionOrder: ['Attributes', 'Boundaries', 'Topology'],
  fields: [
    LaneField.field({ kind: 'enum', name: 'type', label: 'Type', section: 'Attributes', ... }),
    LaneField.field({ kind: 'enum', name: 'turn', ... }),
    LaneField.field({ kind: 'enum', name: 'direction', ... }),
    LaneField.field({ kind: 'number', name: 'speedLimit', ... }),
    LaneField.field({ kind: 'number', name: 'leftWidth', read: readLeftWidth, write: writeLeftWidth, ... }),
    LaneField.field({ kind: 'number', name: 'rightWidth', ... }),
    LaneField.field({ kind: 'enum', name: 'leftBoundaryType', read: readLeftBoundary, write: writeLeftBoundary, ... }),
    LaneField.field({ kind: 'enum', name: 'rightBoundaryType', ... }),
  ],
  readonly: [
    { kind: 'readonly', label: 'ID', section: 'Attributes', compute: e => e.id },
    { kind: 'readonly', label: 'Length', section: 'Boundaries', compute: e => `${(e.length ?? 0).toFixed(2)} m` },
    { kind: 'readonly', label: 'L Virtual', ... },
    { kind: 'readonly', label: 'Junction', section: 'Topology',
      compute: e => createElement(LaneRef, { id: e.junctionId }) },
    { kind: 'readonly', label: 'Predecessors', section: 'Topology',
      compute: e => createElement(LaneRefList, { ids: e.predecessorIds }) },
    // ... 9 个拓扑只读行
  ],
};
```

8 个编辑字段 + 12 个只读行（含 ID / Length / 7 个拓扑列表）。**完全等价于** 旧 `LaneForm.tsx` 的 JSX——意图是 behavior 平移，把"每实体一份 JSX"换成数据。

#### Lane 适配器函数

私有函数，仅模块内使用：

```ts
function applySampleWidth(samples, width, totalLength): LaneSampleAssociation[] {
  if (samples.length === 0) {
    return [
      { s: 0, width },
      { s: Math.max(0, totalLength), width },
    ];
  }
  return samples.map((sample) => ({ s: sample.s, width }));
}

const readLeftWidth = (e: LaneEntity): number => e.leftSamples[0]?.width ?? DEFAULT_LANE_HALF_WIDTH;

const writeLeftWidth = (e: LaneEntity, width: number | undefined): LaneEntity => {
  const next = width ?? DEFAULT_LANE_HALF_WIDTH;
  return { ...e, leftSamples: applySampleWidth(e.leftSamples, next, e.length ?? 0) };
};

// rightWidth / leftBoundary / rightBoundary 同理
```

`leftWidth` 不是 LaneEntity 的字段——它是"统一应用到 leftSamples 全部点的 width"的派生 / 反派生。`write` 把单个数字展开成完整的 sample 数组；`read` 取首元素的 width。

### Schema-generic helpers

#### `formValuesFromEntity(schema, entity): TFormValues`

```ts
export function formValuesFromEntity(schema, entity): TFormValues {
  const result = {} as Record<string, unknown>;
  for (const field of schema.fields) {
    result[field.name as string] = field.read(entity);
  }
  return result as TFormValues;
}
```

把 entity 通过所有字段的 `read` 投影成 react-hook-form 的初始值。

#### `diffFormAgainstEntity(schema, current, entity): Array<[key, value]>`

返回 `current` 与 `formValuesFromEntity(schema, entity)` 不同的字段对——给 `updateEntity` 闸门用。

#### `shouldPersistForm(schema, formValues, entity): boolean`

`diffFormAgainstEntity(...).length > 0`。

#### `applyFormValuesToEntity(schema, entity, values): TEntity`

```ts
export function applyFormValuesToEntity(schema, entity, values): TEntity {
  let next = entity;
  for (const field of schema.fields) {
    const key = field.name as keyof TFormValues;
    if (key in values) {
      const v = values[key];
      const prevValue = field.read(next);
      next = field.write(next, v);

      const newValue = field.read(next);
      if (prevValue !== newValue) {
        const paths = field.overridesPaths ?? [String(field.name)];
        for (const path of paths) {
          next = markUserOverride(next, path);
        }
      }
    }
  }
  return next;
}
```

逐字段调 `write`，并 **仅** 在值确实变化时把 `overridesPaths`（默认 `[name]`）追加到 `_userOverrides`。如果 `applyFormValuesToEntity` 被来自 `formValuesFromEntity` 的"恒等回写"调用，不应误把派生值升级为手动值——所以要比较 `prevValue !== newValue`。

## 副作用

- `applyFormValuesToEntity` 调用 `markUserOverride`（来自 `core/elements/derive`，纯函数返回新对象）
- 否则全部纯函数

## 测试覆盖

集成在 `src/components/layout/panels/__tests__/SchemaForm.test.tsx`（如果存在）—— 验证 Lane schema 与旧 LaneForm 的行为一致。

## 调用方

- `src/components/layout/panels/SchemaForm.tsx` —— 通用渲染器
- `src/components/layout/panels/InspectorForms.tsx` + `src/components/layout/panels/InspectorForms/` —— 在 `entityType === 'lane'` 时渲染 SchemaForm with LaneInspectorSchema
- `src/components/layout/WorkspaceLayout.tsx` + `src/components/layout/WorkspaceLayout/lazyPanels.tsx` —— Dockview 容器与 lazy panel 装配

## 源码索引

| 行      | 内容                      |
| ------- | ------------------------- |
| 36–58   | imports                   |
| 62–86   | `NumberFieldDef`          |
| 88–109  | `EnumFieldDef`            |
| 111–115 | `FieldDef`                |
| 117–126 | `AnyFieldDef`             |
| 130–138 | `ReadOnlyDef`             |
| 142–171 | `EntitySchema`            |
| 173–199 | `fieldBuilder`            |
| 202–247 | Lane 适配器               |
| 251–435 | `LaneInspectorSchema`     |
| 437–456 | `formValuesFromEntity`    |
| 458–481 | `diffFormAgainstEntity`   |
| 483–493 | `shouldPersistForm`       |
| 495–540 | `applyFormValuesToEntity` |

## 参见

- [`entities`](./entities.md) —— `MapEntity` / `LaneEntity`
- [`apollo`](./apollo.md) —— Lane 类型源
- [`enumLabels`](../lib/enum-labels.md) —— `enumCategory` 消费方
- `src/lib/schemas.ts` —— `laneSchema` / `LaneFormValues` / `*Options` 数组
- `core/elements/derive` —— `markUserOverride`
- `src/components/layout/panels/SchemaForm.tsx` —— 实际渲染器
