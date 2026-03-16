<?php
/**
 * Delivery Receipt HTML Template.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Recibo de Entrega #<?php echo $order->get_order_number(); ?></title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #334155; line-height: 1.5; padding: 40px; }
        .invoice-card { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: 800; color: #4f46e5; }
        .business-info { text-align: right; font-size: 13px; color: #64748b; }
        .title { font-size: 20px; font-weight: 700; margin-bottom: 30px; text-transform: uppercase; color: #1e293b; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        .section-label { font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; }
        .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; font-size: 14px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; padding: 12px; border-bottom: 1px solid #e2e8f0; }
        td { padding: 12px; font-size: 14px; border-bottom: 1px solid #f1f5f9; }
        .total-section { text-align: right; }
        .total-row { display: flex; justify-content: flex-end; gap: 20px; margin-bottom: 8px; }
        .total-label { color: #64748b; font-size: 14px; }
        .total-value { font-weight: 700; width: 100px; }
        .grand-total { border-top: 2px solid #e2e8f0; margin-top: 15px; padding-top: 15px; font-size: 18px; color: #4f46e5; }
        .footer { margin-top: 60px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 20px; }
        @media print {
            body { padding: 0; }
            .invoice-card { border: none; box-shadow: none; max-width: 100%; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="no-print" style="text-align: center; margin-bottom: 20px;">
        <button onclick="window.print()" style="background: #4f46e5; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">Imprimir o Guardar PDF</button>
    </div>

    <div class="invoice-card">
        <div class="header">
            <div class="logo">
                <?php if ( $business['logo'] ) : ?>
                    <img src="<?php echo esc_url($business['logo']); ?>" alt="Logo" style="max-height: 50px;">
                <?php else : ?>
                    <?php echo esc_html($business['name']); ?>
                <?php endif; ?>
            </div>
            <div class="business-info">
                <strong><?php echo esc_html($business['name']); ?></strong><br>
                <?php echo esc_html($business['address']); ?><br>
                <?php echo esc_html($business['tax_id']); ?><br>
                <?php echo esc_html($business['email']); ?>
            </div>
        </div>

        <div class="title">Recibo de Entrega</div>

        <div class="grid">
            <div>
                <div class="section-label">Información del Pedido</div>
                <div class="info-box">
                    <strong>Nº Pedido:</strong> <?php echo $order->get_order_number(); ?><br>
                    <strong>Fecha:</strong> <?php echo $order->get_date_created()->date_i18n( get_option('date_format') ); ?><br>
                    <strong>Estado:</strong> <?php echo wc_get_order_status_name($order->get_status()); ?>
                </div>
            </div>
            <div>
                <div class="section-label">Detalles del Cliente</div>
                <div class="info-box">
                    <strong>Nombre:</strong> <?php echo esc_html($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()); ?><br>
                    <strong>Dirección:</strong> <?php echo esc_html($order->get_shipping_address_1()); ?><br>
                    <strong>Teléfono:</strong> <?php echo esc_html($order->get_billing_phone()); ?>
                </div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Descripción</th>
                    <th style="text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ( $order->get_items() as $item_id => $item ) : ?>
                    <tr>
                        <td><?php echo esc_html($item->get_name()); ?> x <?php echo $item->get_quantity(); ?></td>
                        <td style="text-align: right;"><?php echo wc_price($item->get_total()); ?></td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>

        <div class="total-section">
            <div class="total-row">
                <span class="total-label">Subtotal:</span>
                <span class="total-value"><?php echo wc_price($order->get_subtotal()); ?></span>
            </div>
            <div class="total-row">
                <span class="total-label">Envío local:</span>
                <span class="total-value"><?php echo wc_price($order->get_shipping_total()); ?></span>
            </div>
            <div class="total-row grand-total">
                <span class="total-label" style="color: #4f46e5;">TOTAL COMPRA:</span>
                <span class="total-value"><?php echo wc_price($order->get_total()); ?></span>
            </div>
        </div>

        <div class="footer">
            Este es un documento generado automáticamente por <?php echo esc_html($business['name']); ?>.<br>
            ¡Gracias por confiar en nosotros!
        </div>
    </div>
</body>
</html>
