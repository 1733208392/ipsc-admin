import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DRILL_TARGET_TYPE_GROUPS,
  DRILL_TARGET_TYPES,
  type DrillTargetDraft,
  type DrillTargetType,
} from '@/types/drill'

interface Props {
  value: DrillTargetDraft
  onChange: (value: DrillTargetDraft) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

export function TargetEditCard({ value, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: Props) {
  const [expanded, setExpanded] = useState(true)

  function updateType(nextTypes: DrillTargetType[]) {
    if (nextTypes.length === 0) {
      onChange({ ...value, target_type: nextTypes, target_variant: null })
      return
    }

    const existingVariants = value.target_variant ?? []
    const nextVariants = Array.from({ length: nextTypes.length }, (_, idx) => existingVariants[idx] ?? '')
    onChange({ ...value, target_type: nextTypes, target_variant: nextVariants })
  }

  function updateVariant(index: number, nextValue: string) {
    const currentVariants = value.target_variant ?? Array.from({ length: Math.max(0, value.target_type.length) }, () => '')
    const nextVariants = [...currentVariants]
    nextVariants[index] = nextValue
    onChange({ ...value, target_variant: nextVariants })
  }

  function addFace() {
    const nextType = DRILL_TARGET_TYPES.find((type) => !value.target_type.includes(type)) ?? DRILL_TARGET_TYPES[0]
    updateType([...value.target_type, nextType])
  }

  function updateFaceType(index: number, nextType: DrillTargetType) {
    const nextTypes = [...value.target_type]
    nextTypes[index] = nextType
    updateType(nextTypes)
  }

  function removeFace(index: number) {
    const nextTypes = value.target_type.filter((_, currentIndex) => currentIndex !== index)
    if (nextTypes.length > 0) {
      updateType(nextTypes)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="mt-1 cursor-grab active:cursor-grabbing" type="button">
              <GripVertical className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">靶位 #{value.seq_no}</h3>
                <span className="text-xs text-muted-foreground">
                  {value.target_type.length > 0 ? value.target_type.join(' · ') : '未选择类型'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {value.target_name.trim() || '未命名靶位'}
                {value.target_type.length > 0 ? ` · ${value.target_variant?.length ?? 0} 个停留时长` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onMoveUp} disabled={!canMoveUp}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onMoveDown} disabled={!canMoveDown}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded ? (
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>靶位名称</Label>
            <Input
              value={value.target_name}
              onChange={(event) => onChange({ ...value, target_name: event.target.value })}
              placeholder="例如 Paper A"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>靶面序列</Label>
              <Button type="button" variant="outline" size="sm" onClick={addFace}>
                添加靶面
              </Button>
            </div>
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">这里定义的是“同一个物理靶在每个靶面上会停留多久”，首个靶面也要填写停留时间。</p>
              <p className="text-xs text-muted-foreground">
                多个物理靶联动请走 TargetLink，这里只配置单个物理靶的靶面序列。
              </p>

              <div className="space-y-3">
                {value.target_type.length === 0 ? (
                  <p className="text-xs text-muted-foreground">尚未添加靶面，点击“添加靶面”开始配置。</p>
                ) : null}

                <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-2 text-xs font-medium text-muted-foreground">
                  <div>靶面</div>
                  <div>停留时间（秒）</div>
                  <div>记分靶数</div>
                  <div />
                </div>

                {value.target_type.map((targetType, index) => (
                  <div key={`${index}-${targetType}`} className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-2 items-center">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={targetType}
                      onChange={(event) => updateFaceType(index, event.target.value as DrillTargetType)}
                    >
                      {DRILL_TARGET_TYPE_GROUPS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.types.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>

                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={value.target_variant?.[index] ?? ''}
                      onChange={(event) => updateVariant(index, event.target.value)}
                      placeholder="例如 3.0"
                    />

                    <Input
                      type="number"
                      min={0}
                      value={value.counted_shots}
                      onChange={(event) => onChange({ ...value, counted_shots: Number(event.target.value) || 0 })}
                    />

                    <Button type="button" variant="ghost" size="icon" onClick={() => removeFace(index)} disabled={value.target_type.length <= 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={value.has_physical_popper}
              onChange={(event) => onChange({ ...value, has_physical_popper: event.target.checked })}
            />
            有物理 popper 靶
          </label>

          <p className="text-xs text-muted-foreground">`targetVariant` 现在表示每个靶面的停留时长，按靶面顺序逐行填写。</p>
        </CardContent>
      ) : null}
    </Card>
  )
}