"use client";

import { useState } from "react";
import { isQuoteProductPhoto } from "@/lib/pool-quote-catalog";

async function resizePhoto(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024)
        throw new Error("Escolha uma foto JPEG, PNG ou WebP de até 12 MB.");

    const bitmap = await createImageBitmap(file);
    try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        for (const maxSide of [640, 480, 320, 240]) {
            const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            context.fillStyle = "#fff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const photo = canvas.toDataURL("image/jpeg", 0.72);
            if (isQuoteProductPhoto(photo)) return photo;
        }
        throw new Error("A foto ficou grande demais. Escolha uma imagem menor.");
    } finally {
        bitmap.close();
    }
}

export function QuoteProductPhoto({ photo, name }) {
    if (!isQuoteProductPhoto(photo)) return null;
    return <img className="quote-product-photo" src={photo} alt={`Foto de ${name}`} />;
}

export function QuoteProductPhotoInput({ photo, name, onChange, onBusy }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function selectPhoto(event) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setError("");
        setBusy(true);
        onBusy(1);
        try {
            onChange(await resizePhoto(file));
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Não foi possível abrir a foto.");
        } finally {
            setBusy(false);
            onBusy(-1);
        }
    }

    return <div className="quote-product-photo-editor">
        <QuoteProductPhoto photo={photo} name={name} />
        <label>{photo ? "Trocar foto" : "Adicionar foto do produto"}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={selectPhoto} />
        </label>
        {photo && <button type="button" disabled={busy} onClick={() => onChange("")}>Remover foto</button>}
        {busy && <span role="status">Preparando foto…</span>}
        {error && <p role="alert">{error}</p>}
    </div>;
}

export function QuotePhotoGallery({ itemsJson }) {
    let items;
    try { items = JSON.parse(itemsJson || "[]"); }
    catch { return null; }
    if (!Array.isArray(items)) return null;
    const photographed = items.filter((item) => isQuoteProductPhoto(item?.photo));
    if (!photographed.length) return null;

    return <section className="quote-product-gallery" aria-label="Fotos dos produtos">
        {photographed.map((item, index) => <figure key={index}>
            <QuoteProductPhoto photo={item.photo} name={item.name || "produto"} />
            <figcaption>{item.name}</figcaption>
        </figure>)}
    </section>;
}
