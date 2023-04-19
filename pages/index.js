import Head from "next/head";
import { useState, useEffect, useRef } from "react";
import styles from "./index.module.css";

export default function Home() {
  const [inputText, setInputText] = useState("");
  const [result, setResult] = useState();
  const [mapObject, setMapObject] = useState();
  const [simpleStyle, setSimpleStyle] = useState();
  const mapContainer = useRef(null);

  useEffect(() => {
    const map = new window.geolonia.Map({
      container: mapContainer.current,
      zoom: 4,
      center: [136.83, 37.88],
      hash: true,
      style: "geolonia/basic",
    })

    setMapObject(map);

    map.on('load', () => {
    })
  });

  async function onSubmit(event) {
    event.preventDefault();
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input: inputText }),
      });

      const data = await response.json();
      if (response.status !== 200) {
        throw data.error || new Error(`Request failed with status ${response.status}`);
      }

      setResult(data.result);

      if (mapObject && data.result) {

        if (mapObject.getSource('overpass') && simpleStyle) {

          simpleStyle.updateData(data.result).fitBounds()

        } else {
          const simpleStyle = new geolonia.simpleStyle(data.result, {
            id: 'overpass',
          })
          simpleStyle.addTo(mapObject).fitBounds()

          setSimpleStyle(simpleStyle)
        }
      }

      setInputText("");
    } catch(error) {
      console.error(error);
      alert(error.message);
    }
  }

  return (
    <div>
      <Head>
        <title>OpenAI Quickstart</title>
        <link rel="icon" href="/dog.png" />
      </Head>

      <main className={styles.main}>
        <img src="/dog.png" className={styles.icon} />
        <h3>Name my pet</h3>
        <form onSubmit={onSubmit}>
          <input
            type="text"
            name="animal"
            placeholder="Enter an animal"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <input type="submit" value="Generate names" />
        </form>
        {/* <div className={styles.result}>{JSON.stringify(result)}</div> */}
        <div className={styles.map} ref={mapContainer}/>
      </main>
      <script type="text/javascript" src="https://cdn.geolonia.com/v1/embed?geolonia-api-key=YOUR-API-KEY"></script>
    </div>
  );
}