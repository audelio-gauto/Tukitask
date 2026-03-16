<?php
/**
 * Payout Invoice HTML Template.
 */
if ( ! defined( 'ABSPATH' ) ) exit;
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Comprobante de Pago #<?php echo $payout->id; ?></title>
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #334155; line-height: 1.5; padding: 40px; }
        .invoice-card { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 40px; }
        .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: 800; color: #4f46e5; }
        .business-info { text-align: right; font-size: 13px; color: #64748b; }
        .title { font-size: 22px; font-weight: 700; margin-bottom: 30px; text-transform: uppercase; color: #1e293b; }
        .summary-box { background: #f8fafc; padding: 25px; border-radius: 12px; margin-bottom: 30px; border: 1px solid #f1f5f9; }
        .summary-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 15px; }
        .total-row { border-top: 2px solid #e2e8f0; margin-top: 15px; padding-top: 15px; font-size: 18px; font-weight: 700; color: #4f46e5; }
        .footer { margin-top: 60px; font-size: 12px; color: #94a3b8; text-align: center; }
        @media print { .no-print { display: none; } }
    </style>
</head>
<body>
    <div class="no-print" style="text-align: center; margin-bottom: 20px;">
        <button onclick="window.print()" style="background: #4f46e5; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-weight: 600;">Descargar como PDF</button>
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
            </div>
        </div>

        <div class="title">Comprobante de Liquidación</div>

        <div class="summary-box">
            <div class="summary-row">
                <span>Nº Referencia:</span>
                <strong>TT-PAY-<?php echo str_pad($payout->id, 6, '0', STR_PAD_LEFT); ?></strong>
            </div>
            <div class="summary-row">
                <span>Fecha de Emisión:</span>
                <strong><?php echo date_i18n( get_option('date_format'), strtotime($payout->created_at) ); ?></strong>
            </div>
            <div class="summary-row">
                <span>Estado:</span>
                <strong style="color: #10B981;">PAGADO</strong>
            </div>
            
            <div class="summary-row total-row">
                <span>TOTAL TRANSFERIDO:</span>
                <span><?php echo wc_price($payout->amount); ?></span>
            </div>
        </div>

        <div style="font-size: 14px; color: #64748b;">
            <p>Este documento certifica la liquidación exitosa de fondos desde el Marketplace hacia su cuenta registrada. La transferencia incluye el total de ventas acumuladas menos las comisiones de plataforma aplicables.</p>
        </div>

        <div class="footer">
            Generado digitalmente por <?php echo esc_html($business['name']); ?>.
        </div>
    </div>
</body>
</html>
