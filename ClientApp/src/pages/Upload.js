import React, { useRef, useState } from "react";
import "../styles/Upload.css";
import * as XLSX from "xlsx";
function Upload() {

    const [dataFile, setDataFile] = useState(null);
    const [mappingFile, setMappingFile] = useState(null);
    const [logs, setLogs] = useState([]);
    const [dataFileName, setDataFileName] = useState("");
    const [mappingFileName, setMappingFileName] = useState("");
    const [itemType, setItemType] = useState("");
    const [currentItem, setCurrentItem] = useState("");
    const dataInputRef = useRef(null);
    const mappingInputRef = useRef(null);


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


            const requestPayload = {
                itemType: itemType
            };

            const formData = new FormData();
            formData.append("dataFile", dataFile);
            formData.append("mappingFile", mappingFile);
            formData.append("requestJson", JSON.stringify(requestPayload));

            let aras = window.aras || window.parent.aras || window.top.aras;

            if (!aras) {

                alert("Aras context not found");
                return;
            }

            let baseUrl = aras.getBaseURL();
            baseUrl = baseUrl.replace(/X-salt-[^/]+\//, "");
            const rootUrl = baseUrl.split("/Client")[0];
            const apiUrl = rootUrl.replace(/\/[^/]+$/, "/BatchLoaderAPI") + "/api/import/bom";
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

            // PART

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

                        const now = new Date();

                        if (rowError) {

                            failCount++;

                            let errorMessage = "Unknown error";

                            try {
                                const parser = new DOMParser();
                                const xml = parser.parseFromString(singleRes, "text/xml");

                                const fault = xml.getElementsByTagName("faultstring")[0];

                                if (fault && fault.textContent) {
                                    errorMessage = fault.textContent;
                                }

                            } catch (e) {
                                errorMessage = "Error parsing response";
                            }

                            setLogs(prev => [
                                ...prev,
                                {
                                    date: now.toLocaleDateString(),
                                    time: now.toLocaleTimeString(),
                                    item: row.item_number || row.name || "",
                                    status: "FAILED",
                                    error: errorMessage  
                                }
                            ]);

                        } else {

                            successCount++;

                            setLogs(prev => [
                                ...prev,
                                {
                                    date: now.toLocaleDateString(),
                                    time: now.toLocaleTimeString(),
                                    item: row.item_number || row.name || "",
                                    status: "SUCCESS",
                                    error: ""
                                }
                            ]);
                        }
                    }

                } else {
                    successCount += batch.length;
                    console.log(`✅ Batch ${i + 1} success`);
                }

                setCurrentItem(
                    `Processing Items... ${successCount + failCount}/${rows.length}`
                );
            }

            // BOM

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

            // Final status

            const total = successCount + failCount;

            setCurrentItem(
                `Import Completed! ${successCount}/${total} items imported successfully`
            );

        } catch (err) {
            console.error(err);
            alert("Import failed");
        }
    };
    const exportLogs = () => {

        if (logs.length === 0) {
            alert("No logs to export");
            return;
        }

        const now = new Date();

        const fileName =
            now.getFullYear() + "-" +
            String(now.getMonth() + 1).padStart(2, '0') + "-" +
            String(now.getDate()).padStart(2, '0') + "." +
            String(now.getHours()).padStart(2, '0') + "-" +
            String(now.getMinutes()).padStart(2, '0');

        let content = "Date\tTime\tItem\tStatus\tError\n";

        logs.forEach(log => {
            content += `${log.date}\t${log.time}\t${log.item}\t${log.status}\t${log.error}\n`;
        });

        const blob = new Blob([content], { type: "text/plain" });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName + ".txt";

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };



    return (

        <div className="upload-container">

            <h2>Item Loader</h2>

            {/* Upload Section */}

            <div className="upload-top-section">

                <div className="drop-zone">

                    <h4>Upload Data Excel</h4>

                    <input

                        ref={dataInputRef}

                        type="file"

                        accept=".xls,.xlsx"

                        onChange={handleDataFileChange}

                    />

                    {dataFileName && (
                        <div className="file-name-row">
                            <span>{dataFileName}</span>
                            <button

                                className="remove-btn"

                                onClick={() => {

                                    setDataFile(null);

                                    setDataFileName("");

                                    dataInputRef.current.value = "";

                                }}
                            >

                                ❌
                            </button>
                        </div>

                    )}

                </div>


                <div className="drop-zone">

                    <h4>Upload Mapping Excel</h4>

                    <input

                        ref={mappingInputRef}

                        type="file"

                        accept=".xls,.xlsx"

                        onChange={handleMappingFileChange}

                    />

                    {mappingFileName && (
                        <div className="file-name-row">
                            <span>{mappingFileName}</span>
                            <button

                                className="remove-btn"

                                onClick={() => {

                                    setMappingFile(null);

                                    setMappingFileName("");

                                    mappingInputRef.current.value = "";

                                }}
                            >

                                ❌
                            </button>
                        </div>

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
                    <h4>Import Progress</h4>

                    <button
                        className="export-btn"
                        onClick={exportLogs}
                    >
                        Export Logs
                    </button>
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