import { useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { PersonalDrillTemplateDetail } from '@/types/my'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: PersonalDrillTemplateDetail | null
}

export function DrillExportDialog({ open, onOpenChange, template }: Props) {
  const exportJson = useMemo(() => {
    if (!template) return ''
    return JSON.stringify(
      {
        drillId: template.id,
        name: template.name,
        timeout: template.timeout,
        targets: template.targets.map((target) => ({
          id: `drill_target_${target.id}`,
          seqNo: target.seq_no,
          targetName: target.target_name,
          targetType: target.target_type.length === 1 ? target.target_type[0] : target.target_type,
          timeout: target.timeout,
          countedShots: target.counted_shots,
          targetVariant: target.target_variant,
          hasPhysicalPopper: Boolean(target.has_physical_popper),
        })),
      },
      null,
      2
    )
  }, [template])

  async function copyExport() {
    if (!exportJson) return
    await navigator.clipboard.writeText(exportJson)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>导出训练模板</DialogTitle>
          <DialogDescription>iOS 端可直接使用下面的 JSON，同步个人 Drill 配置。</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <pre className="max-h-[60vh] overflow-auto rounded-md border bg-muted p-4 text-xs leading-5 whitespace-pre-wrap break-words">
            {exportJson || '未选择模板'}
          </pre>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
            <Button onClick={() => void copyExport()} disabled={!exportJson}>复制 JSON</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}