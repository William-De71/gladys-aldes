# Aldes

## Überblick

Diese Integration bringt die Aldes-Produkte nach Gladys, die mit der App **AldesConnect** verbunden sind: die **Lüftungsgeräte** (InspirAIR Home, EasyHOME PureAIR Compact Connect / Premium, Dee Fly Cube) und die Wärmepumpen **T.One AIR / AquaAIR** mit ihren Raumthermostaten. Sie meldet sich wie die App mit der E-Mail-Adresse und dem Passwort Ihres AldesConnect-Kontos an.

- Ein **Lüftungsgerät**: sein Modus (Täglich, Boost, Gäste, Urlaub, Zeitprogramm), der CO2-Gehalt, Temperatur und Feuchte der Küche und jedes Badezimmers, die Restlaufzeit des Filters – jeder Wert, sofern das Gerät ihn meldet.
- Eine **T.One-Wärmepumpe**: ihr Luftmodus (Aus, Heizen Komfort / Eco / Programm A oder B, Kühlen Komfort / Boost / Programm C oder D), bei einer AquaAIR der Warmwassermodus (Ein, Boost, Aus) und das verfügbare Warmwasser, die Haupttemperatur.
- Ein **Thermostat** pro Raum einer T.One: seine Solltemperatur (in ganzen Grad) und die Raumtemperatur.
- Szenen-Auslöser (Modus geändert, offline, Filter fällig, Urlaub) und Szenen-Aktionen (Lüftungsmodus, zeitlich begrenzter Boost, Luftmodus, Warmwasser, Urlaub, jetzt abfragen).
- Zwei Dashboard-Widgets: das Lüftungsgerät und die T.One.

**Transport: Cloud.** Gladys spricht nie direkt mit Ihren Produkten: Es liest und schreibt in der Aldes-Cloud, die die Befehle an das Produkt weitergibt. Eine Änderung in Gladys wird sofort angezeigt und einige Sekunden später bestätigt; eine Änderung in der App, durch das Zeitprogramm oder am Produkt erreicht Gladys bei der nächsten Abfrage. Ihre Daten verlassen Ihr Zuhause (das ist mit der App bereits der Fall).

Keine Verbindung zu Aldes. Genutzt wird der Dienst der AldesConnect-App; Aldes **dokumentiert ihn nicht** und kann ihn ohne Vorankündigung ändern. Die Anfragen sind dieselben, die die Community-Projekte verwenden: die Aldes-Integrationen für Home Assistant ([guix77/homeassistant-aldes](https://github.com/guix77/homeassistant-aldes), [saniho/homeassistant-aldes](https://github.com/saniho/homeassistant-aldes)), die Homebridge-Plugins und aldes2mqtt. Noch nicht mit einem echten Konto getestet: Sagen Sie uns, was funktioniert und was nicht.

![Generierte Illustration der beiden Widgets: die Aldes-Lüftung (CO2, Temperatur und Feuchte der Küche, Filter, Modus, Schaltflächen Boost 30 Min., Täglich und Aktualisieren) und die Aldes T.One (Innentemperatur, Warmwasser, Räume mit ihren Solltemperaturen, Luft- und Warmwassermodus) – kein Screenshot](https://raw.githubusercontent.com/William-De71/gladys-aldes/main/docs/assets/widgets.de.png)

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Ein Aldes-Lüftungsgerät oder eine T.One, bereits installiert und in der App **AldesConnect** sichtbar.
- Das **AldesConnect-Konto**: Prüfen Sie, dass Sie sich mit Ihrer E-Mail-Adresse und Ihrem Passwort in der App anmelden können. Aldes bietet keinen getrennten Zugang für Dritte: Die Integration verwendet das Passwort Ihres Kontos.

## Konfiguration

Öffnen Sie in Gladys **Integrationen → Aldes**:

| Feld                    | Beschreibung                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| E-Mail                  | Die E-Mail-Adresse Ihres AldesConnect-Kontos.                                                        |
| Passwort                | Sein Passwort: nur an Aldes gesendet, im Speicher gehalten, nie wieder angezeigt oder protokolliert. |
| Abfrageintervall        | Alle 1, 2, 5 oder 10 Minuten (standardmäßig 2). Eine einzige Anfrage liest alle Produkte.            |
| Sprache der Gerätetexte | Namen der Funktionen und Modi, Meldungen der Schaltfläche; standardmäßig automatisch.                |

Klicken Sie auf **Verbindung testen**: Die Integration meldet sich an und listet die gefundenen Produkte und Raumthermostate auf, ebenso die Produkte, die sie nicht unterstützt. Öffnen Sie dann den Reiter **Entdecken** und fügen Sie die gewünschten Geräte hinzu: Ohne Sie wird nichts angelegt.

## Verwendung

### Geräte

| Gerät            | Funktionen                                                                  | Hinweise                                                                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lüftungsgerät    | Modus, CO2, Temperatur und Feuchte von Küche und Bädern, Filterrestlaufzeit | Jeder Sensor erscheint nur, wenn das Gerät ihn meldet (ein CO2-Wert von 0 bedeutet: kein Sensor). „Urlaub“ in der Modusliste hält den Urlaubsmodus, bis ein anderer Modus gewählt wird. |
| T.One-Wärmepumpe | Luftmodus, Warmwassermodus, verfügbares Warmwasser, Haupttemperatur         | Warmwasser: nur bei einer T.One AquaAIR. Die Liste der Luftmodi enthält die neun Modi der App.                                                                                          |
| Raumthermostat   | Solltemperatur, Raumtemperatur (und Feuchte, wenn gemessen)                 | In ganzen Grad, innerhalb der Heizgrenzen (oder Kühlgrenzen), die Aldes für die T.One angibt.                                                                                           |

Ein Produkt, das Aldes als **offline** meldet, lehnt die Befehle ab: Die Cloud würde sie annehmen, aber das Produkt würde sie nie erhalten.

Die Filterrestlaufzeit wird aus dem von Aldes gemeldeten Verschleiß berechnet (100 % − Verschleiß). Das Feld ist nicht dokumentiert: Vergleichen Sie es beim ersten Mal mit der App.

### Dashboard-Widgets

- **Aldes-Lüftung**: der CO2-Wert (grün unter 800 ppm, orange unter 1.200, rot darüber), Temperatur und Feuchte der Küche, die Filterrestlaufzeit, der Modus (und der unter dem Zeitprogramm laufende Modus), das Ende eines Boosts, die Verbindung. **Boost 30 Min.** startet einen Boost und kehrt nach 30 Minuten zum vorherigen Modus zurück, **Täglich** kehrt zur täglichen Lüftung zurück, **Aktualisieren** fragt sofort ab. Wählen Sie das Lüftungsgerät in den Einstellungen des Widgets.
- **Aldes T.One**: die Haupttemperatur, das verfügbare Warmwasser, die Räume mit ihrer Temperatur und Solltemperatur, Luft- und Warmwassermodus, der Urlaub, die Verbindung, eine Schaltfläche **Aktualisieren**. Wählen Sie die T.One in den Einstellungen des Widgets.

### Szenen

Auslöser (jeder lässt sich auf ein Produkt beschränken):

- **Der Modus eines Aldes-Produkts ändert sich**: in der App, durch sein Zeitprogramm oder am Produkt (nie eine von Gladys angeforderte Änderung); Filter auf den neuen Modus. Neuer und vorheriger Modus sind Variablen.
- **Ein Aldes-Produkt geht offline oder wieder online** in der Aldes-Cloud (Filter auf das eine oder das andere).
- **Ein Aldes-Filter ist fällig**: Seine Restlaufzeit sinkt auf 10 % oder weniger; nur einmal, bis der Filter gewechselt wird.
- **Ein Aldes-Urlaub beginnt oder endet**: der in der App gesetzte Urlaubsmodus (nie durch die Aktion der Integration); bei einer T.One ist das Enddatum eine Variable.

Aktionen:

- **Aldes-Lüftungsmodus setzen**: Täglich, Boost, Gäste oder Zeitprogramm, für ein Lüftungsgerät oder alle.
- **Aldes-Lüftung boosten**: Boost für eine Anzahl von Minuten (standardmäßig 30, 0 = bis zu einem anderen Modus), danach zurück zum vorherigen Modus. Ausgabe: die Endzeit. Gladys führt den Timer: Startet die Integration in der Zwischenzeit neu, bleibt der Boost aktiv.
- **T.One-Luftmodus setzen**: einer der neun Modi.
- **T.One-Warmwasser einstellen**: Ein, Boost oder Aus (AquaAIR).
- **Aldes-Urlaub setzen**: ab sofort für eine Anzahl von Tagen, oder 0, um ihn aufzuheben.
- **Aldes jetzt abfragen**: Modus, CO2, Temperatur, Feuchte, Warmwasser, Filterrestlaufzeit und Verbindung eines Produkts (−1, wenn unbekannt).

Beispiele:

- Wenn die Feuchte im Bad 75 % übersteigt → die Lüftung 20 Minuten lang boosten.
- Wenn der Filter fällig ist → eine Benachrichtigung senden: „Filter der Lüftungsanlage: {{triggerEvent.data.filter_life}} %“.
- Bei der Abreise in den Urlaub → Urlaubsmodus für 7 Tage; bei der Rückkehr → Urlaub auf 0 Tage setzen.

### Transport

Der Katalog zeigt das Abzeichen **cloud**: Alle Anfragen gehen mit Ihrem Konto an `aldesiotsuite-aldeswebapi.azurewebsites.net`, den Dienst der AldesConnect-App. Die App bietet keinen lokalen Zugriff.

## Fehlerbehebung

- **„Aldes hat E-Mail oder Passwort abgelehnt“**: Prüfen Sie beides in der AldesConnect-App. Die Integration versucht es alle 30 Minuten erneut oder sobald Sie die Angaben ändern.
- **Verbunden, aber kein Produkt**: Das Konto hat weder Lüftungsgerät noch T.One, oder nur Produkte, die die Integration noch nicht unterstützt (zum Beispiel einen T.Flow-Warmwasserbereiter): „Verbindung testen“ listet sie auf.
- **Ein Befehl wird abgelehnt, weil das Produkt offline ist**: Prüfen Sie das WLAN des Produkts und seine Verbindung in der App.
- **Ein Befehl wird nach einigen Minuten rückgängig gemacht**: Aldes hat ihn nicht ausgeführt; das Dashboard zeigt wieder, was die Cloud meldet.
- **Ein Sensor fehlt**: Das Gerät meldet ihn nicht oder meldet 0 (kein Sensor).
- **Der Boost hat nicht aufgehört**: Die Integration ist während des Boosts neu gestartet; wählen Sie einen anderen Modus.
- **Nach einem Update der App funktioniert nichts mehr**: Der undokumentierte Dienst hat sich vielleicht geändert; melden Sie es.
- Melden Sie ein Problem auf [GitHub](https://github.com/William-De71/gladys-aldes/issues) mit Ihrer Gladys-Version, der Version der Integration, dem Modell des Produkts und dem Ergebnis von „Verbindung testen“.
