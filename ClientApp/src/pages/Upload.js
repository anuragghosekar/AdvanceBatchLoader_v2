import React, { useState } from "react";
import "../styles/Upload.css";
import * as XLSX from "xlsx";

function Upload() {

    const [dataFile, setDataFile] = useState(null);
    const [mappingFile, setMappingFile] = useState(null);

    const [dataFileName, setDataFileName] = useState("");
    const [mappingFileName, setMappingFileName] = useState("");
    const [itemType, setItemType] = useState("");
    const [currentItem, setCurrentItem] = useState("");

    const itemTypes = [
        "Part",
        "Document",
        "CAD Document"
    ];
    const aras = window.top.aras;
    const url = aras.getServerBaseURL() + "InnovatorServer.aspx";
    async function applyAML(aml) {
        

        
        const headers = aras.getHttpHeadersForSoapMessage("ApplyAML");

        headers["Content-Type"] = "text/xml";

        const res = await fetch(url, {
            method: "POST",
            headers: headers,
            body: aml
        });

        const text = await res.text();

        console.log("AML Response:", text);

        return text;
    }

    async function getPartMap(itemNumbers) {
        const inClause = itemNumbers.map(p => `'${p}'`).join(",");

        const aml = `
                    <AML>
                        <Item type='Part' action='get' select='id,item_number'>
                            <item_number condition='in'>${inClause}</item_number>
                        </Item>
                    </AML>`;

        const res = await applyAML(aml);

        if (res.includes("<Fault>")) {
            console.error("Aras Error:", res);
            alert("Import failed. Check console.");
            return;
        }

        const parser = new DOMParser();
        const xml = parser.parseFromString(res, "text/xml");

        const items = xml.getElementsByTagName("Item");

        const map = {};

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const id = item.getAttribute("id");
            const itemNumber = item.getElementsByTagName("item_number")[0]?.textContent;

            map[itemNumber] = id;
        }

        return map;
    }


    const handleDataFileChange = (event) => {

        const selected = event.target.files[0];

        if (selected) {
            setDataFile(selected);
            setDataFileName(selected.name);
        }
    };

    const handleMappingFileChange = (event) => {

        const selected = event.target.files[0];

        if (selected) {
            setMappingFile(selected);
            setMappingFileName(selected.name);
        }
    };

    const handleImport = async () => {

        if (!dataFile) {
            alert("Please upload Data Excel file");
            return;
        }

        if (!mappingFile) {
            alert("Please upload Mapping Excel file");
            return;
        }

        if (!itemType) {
            alert("Please select ItemType");
            return;
        }

        try {

            const apiUrl = "http://localhost/BatchLoaderAPI/api/import/bom";

            const requestPayload = {
                itemType: itemType
            };

            const formData = new FormData();
            formData.append("dataFile", dataFile);
            formData.append("mappingFile", mappingFile);
            formData.append("requestJson", JSON.stringify(requestPayload));

            const response = await fetch(apiUrl, {
                method: "POST",
                body: formData,
                credentials: "include"
            });

            if (!response.ok) {
                const text = await response.text();
                alert("API failed: " + text);
                return;
            }

            const result = await response.json();

            const rows = result.rows || [];
            const bom = result.bom || [];
            const backendItemType = result.itemType;
            const relationshipType = backendItemType + " BOM";

            setCurrentItem("Import Started...");

            // 🔥 COUNTERS
            let successCount = 0;
            let failCount = 0;

            const chunkArray = (array, size) => {
                const result = [];
                for (let i = 0; i < array.length; i += size) {
                    result.push(array.slice(i, i + size));
                }
                return result;
            };

            const batchSize = 200;
            const batches = chunkArray(rows, batchSize);

            // ========================
            // 🔥 CREATE ITEMS
            // ========================

            for (let i = 0; i < batches.length; i++) {

                const batch = batches[i];

                let aml = "<AML>";

                batch.forEach(row => {
                    aml += `<Item type='${backendItemType}' action='add'>`;

                    Object.entries(row).forEach(([key, value]) => {
                        if (value) {
                            aml += `<${key}>${value}</${key}>`;
                        }
                    });

                    aml += `</Item>`;
                });

                aml += "</AML>";

                let res = await applyAML(aml);

                const isError =
                    res.includes("<SOAP-ENV:Fault>") ||
                    res.includes("<Fault>") ||
                    res.includes("Exception");

                if (isError) {

                    console.warn(`Batch ${i + 1} failed → row fallback`);

                    for (let j = 0; j < batch.length; j++) {

                        const row = batch[j];

                        let singleAml = "<AML>";
                        singleAml += `<Item type='${backendItemType}' action='add'>`;

                        Object.entries(row).forEach(([key, value]) => {
                            if (value) {
                                singleAml += `<${key}>${value}</${key}>`;
                            }
                        });

                        singleAml += `</Item></AML>`;

                        let singleRes = await applyAML(singleAml);

                        const rowError =
                            singleRes.includes("<SOAP-ENV:Fault>") ||
                            singleRes.includes("<Fault>") ||
                            singleRes.includes("Exception");

                        if (rowError) {
                            failCount++;
                            console.error(`❌ Row ${i + j + 2} failed`);
                        } else {
                            successCount++;
                            console.log(`✅ Row ${i + j + 2} success`);
                        }
                    }

                } else {
                    successCount += batch.length; // 🔥 IMPORTANT FIX
                    console.log(`✅ Batch ${i + 1} success`);
                }

                setCurrentItem(
                    `Processing Items... ${successCount + failCount}/${rows.length}`
                );
            }

            // ========================
            // 🔥 CREATE BOM
            // ========================

            const partNumbers = [
                ...new Set([
                    ...bom.map(b => b.parentPart),
                    ...bom.map(b => b.childPart)
                ])
            ];

            const partMap = await getPartMap(partNumbers);

            const bomBatches = chunkArray(bom, 200);

            for (let i = 0; i < bomBatches.length; i++) {

                const batch = bomBatches[i];

                let bomAml = "<AML>";

                batch.forEach(row => {

                    const parentId = partMap[row.parentPart];
                    const childId = partMap[row.childPart];

                    if (!parentId || !childId) return;

                    bomAml += `
<Item type='${backendItemType} BOM' action='add'>
    <source_id>${parentId}</source_id>
    <related_id>${childId}</related_id>
    <quantity>${row.quantity}</quantity>
</Item>`;
                });

                bomAml += "</AML>";

                let res = await applyAML(bomAml);

                const isError =
                    res.includes("<SOAP-ENV:Fault>") ||
                    res.includes("<Fault>") ||
                    res.includes("Exception");

                if (isError) {
                    console.warn(`BOM batch ${i + 1} failed`);
                }

                setCurrentItem(
                    `Processing BOM... ${i + 1}/${bomBatches.length}`
                );
            }

            // ========================
            // ✅ FINAL STATUS
            // ========================

            const total = successCount + failCount;

            setCurrentItem(
                `Import Completed! ${successCount}/${total} items imported successfully`
            );

        } catch (err) {
            console.error(err);
            alert("Import failed");
        }
    };


    return (

        <div className="upload-container">

            <h2>Batch Import</h2>

            {/* Upload Section */}

            <div className="upload-top-section">

                <div className="drop-zone">

                    <h4>Upload Data Excel</h4>

                    <input
                        type="file"
                        accept=".xls,.xlsx"
                        onChange={handleDataFileChange}
                    />

                    {dataFileName && (
                        <p className="file-name">
                            {dataFileName}
                        </p>
                    )}

                </div>

                <div className="drop-zone">

                    <h4>Upload Mapping Excel</h4>

                    <input
                        type="file"
                        accept=".xls,.xlsx"
                        onChange={handleMappingFileChange}
                    />

                    {mappingFileName && (
                        <p className="file-name">
                            {mappingFileName}
                        </p>
                    )}

                </div>

                <div className="itemtype-section">

                    <button
                        className="import-btn"
                        onClick={handleImport}
                        disabled={!dataFile || !mappingFile || !itemType}
                    >
                        Start Import
                    </button>

                    <select
                        value={itemType}
                        onChange={(e) => setItemType(e.target.value)}
                    >

                        <option value="">Select ItemType</option>

                        {itemTypes.map((type, index) => (
                            <option key={index} value={type}>
                                {type}
                            </option>
                        ))}

                    </select>

                </div>

            </div>


            {/* Progress Section */}

            <div className="logs-section">

                <div className="logs-header">
                    <h3>Import Progress</h3>
                </div>

                <div className="logs-table-container">

                    <div className="import-status-card">
                        {currentItem}
                    </div>

                </div>  

            </div>

        </div>

    );
}

export default Upload;