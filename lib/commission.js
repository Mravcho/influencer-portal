// Комисионна per-order.
// Кампанийните поръчки носят собствена ставка (orders.commission_pct, напр. 5%).
// Нормалните поръчки (commission_pct = NULL) ползват ставката на инфлуенсъра.

export function orderCommissionRate(order, influencerRate) {
  const per = order?.commission_pct
  if (per !== null && per !== undefined && per !== '') return Number(per) || 0
  return Number(influencerRate || 0)
}

// commissionable = сумата, върху която се смята комисионната за тази поръчка
export function orderCommission(order, commissionable, influencerRate) {
  return (Number(commissionable) || 0) * orderCommissionRate(order, influencerRate) / 100
}
