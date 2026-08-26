import Link from 'next/link';

export const metadata = {
    title: 'What you can ask',
    description: 'The things EDI can be asked to do, and the things it cannot yet.',
};

export default function Asking() {
    return (
        <>
            <div className="edi-kicker-doc">Start</div>
            <h1>What you can ask</h1>
            <p className="lede">
                There is no command syntax and no menu of features. You type a sentence and
                EDI works out whether it is a question about the data, a chart, or an
                instruction to change the sheet. This is what it currently does with each.
            </p>

            <div className="edi-note">
                Every example below was run against a real sheet, and the &ldquo;rough
                edges&rdquo; at the bottom are the ones that failed when we tried them.
                Answer quality depends on the model you configured, so a weaker one will
                do worse on the questions even where the plumbing is identical — see{' '}
                <Link href="/models">Choosing a model</Link>.
            </div>

            <h2>Questions about the data</h2>
            <p>
                The common case. Your question becomes read-only SQL, runs against the
                sheet, and the rows come back as prose. Nothing is changed.
            </p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Ask</th><th>You get</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>Which region had the highest total revenue?</code></td>
                            <td>The answer, the number, and two follow-up questions worth asking next</td>
                        </tr>
                        <tr>
                            <td><code>how many orders came from the East region?</code></td>
                            <td>A count</td>
                        </tr>
                        <tr>
                            <td><code>what is the average unit price?</code></td>
                            <td>An average</td>
                        </tr>
                        <tr>
                            <td><code>compare the East and West regions</code></td>
                            <td>A comparison across several measures at once</td>
                        </tr>
                        <tr>
                            <td><code>what is this data about</code></td>
                            <td>A description of the sheet, inferred from its columns and values</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                Column names do not need to be quoted or spelled exactly as the header —
                the model is reading the sheet, so &ldquo;revenue&rdquo; finds a column
                called <code>Revenue</code>.
            </p>

            <h2>Charts</h2>
            <p>
                When an answer is shaped like a chart, you get one. The backend returns a
                spec — chart type, axis, series, rows — and the browser draws it, so what
                arrives is data rather than a picture.
            </p>
            <pre><code>{`Chart total revenue by month
plot total revenue by region as a bar chart`}</code></pre>
            <p>
                Each chart carries a <strong>View data</strong> control, so the numbers
                behind it are always one click away rather than something you have to
                take on trust.
            </p>

            <h2>Finding problems</h2>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Ask</th><th>You get</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>analyze this data</code></td>
                            <td>A pass over the whole sheet for anomalies and things worth a second look</td>
                        </tr>
                        <tr>
                            <td><code>are there any missing values?</code></td>
                            <td>Which columns have gaps, or confirmation that none do</td>
                        </tr>
                        <tr>
                            <td><code>are there any duplicate rows?</code></td>
                            <td>A count, without changing anything</td>
                        </tr>
                        <tr>
                            <td><code>remove duplicate rows</code></td>
                            <td>The duplicates gone, and a note of how many</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <h2>Changing what you see</h2>
            <p>These reorder or hide rows. The underlying data is untouched.</p>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Ask</th><th>You get</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>sort the sheet by revenue, highest first</code></td>
                            <td>Sorted, with the direction confirmed back to you</td>
                        </tr>
                        <tr>
                            <td><code>filter Region equals East</code></td>
                            <td>Only matching rows left visible</td>
                        </tr>
                        <tr>
                            <td><code>filter Category contains Grinders</code></td>
                            <td>Same, matching on part of a value</td>
                        </tr>
                        <tr>
                            <td><code>show all rows again</code></td>
                            <td>Every filter cleared</td>
                        </tr>
                        <tr>
                            <td><code>freeze the first row</code></td>
                            <td>Headers pinned while you scroll</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                Filters match on <strong>equals</strong> or <strong>contains</strong>, by
                column name or by letter (<code>filter column C with the value West</code>).
                Comparisons like <em>over 5000</em> are not implemented — ask the question
                instead, and you will get the answer without touching the sheet.
            </p>

            <h2>Changing how it looks</h2>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Ask</th><th>You get</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>make the header row bold</code></td>
                            <td>Bold. Also works on a cell (<code>make A1 bold</code>) or a column</td>
                        </tr>
                        <tr>
                            <td><code>highlight revenue over 5000 in green</code></td>
                            <td>A background colour on the cells that qualify</td>
                        </tr>
                        <tr>
                            <td><code>autofit the columns</code></td>
                            <td>Every column widened to its content</td>
                        </tr>
                        <tr>
                            <td><code>format this sheet nicely</code></td>
                            <td>Currency, dates and numbers detected and formatted in one pass</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                Name a colour when you highlight. Without one you get asked for it rather
                than a guess.
            </p>

            <h2>Changing the data</h2>
            <div className="table-scroll">
                <table>
                    <thead>
                        <tr><th>Ask</th><th>You get</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><code>replace East with Eastern</code></td>
                            <td>Every instance replaced, and a count of them</td>
                        </tr>
                        <tr>
                            <td><code>delete column I</code></td>
                            <td>The column removed</td>
                        </tr>
                        <tr>
                            <td><code>hide column D</code></td>
                            <td>Hidden, not deleted</td>
                        </tr>
                        <tr>
                            <td><code>translate the Region column to French</code></td>
                            <td>A new <code>Region_Translated</code> column, leaving the original alone</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p>
                Everything here is saved as you go, and{' '}
                <strong>Download as CSV</strong> in the workbook menu gets it back out.
            </p>

            <h2>Rough edges</h2>
            <p>
                Worth knowing before you hit them. These are things the app will accept and
                then fail at, rather than things it refuses:
            </p>
            <ul>
                <li>
                    <strong>Column operations want a letter, not a header name.</strong>{' '}
                    <code>delete column I</code> works; <code>delete the Rep column</code>{' '}
                    does not. This applies to deleting and hiding, not to sorting,
                    filtering or asking questions — those all take names happily.
                </li>
                <li>
                    <strong>Adding and inserting columns does not work.</strong> Neither{' '}
                    <code>insert a column after B</code> nor{' '}
                    <code>add a column called Margin</code> succeeds.
                </li>
                <li>
                    <strong>Renaming a column does not work</strong> from the chat.
                </li>
                <li>
                    <strong>Comments, hyperlinks and data validation are not implemented.</strong>{' '}
                    The classifier recognises them and the sidebar then has nothing to hand
                    them to, so you get &ldquo;unable to process spreadsheet command&rdquo;.
                </li>
                <li>
                    <strong>Filters do not do comparisons.</strong> Equals and contains
                    only, as above.
                </li>
            </ul>
            <p>
                For anything the chat cannot do, the sheet is a real spreadsheet — Univer,
                with its own toolbar — so you can do it by hand.
            </p>

            <h2>How it decides</h2>
            <p>
                Two classifications, not one. The browser checks first whether your
                sentence is a spreadsheet operation it can carry out itself, using patterns
                where they are unambiguous and the model where they are not. Anything that
                is a plain question skips that entirely and goes to the backend, which
                categorises it again to choose between SQL, a chart, a data-quality pass
                and the rest.
            </p>
            <p>
                <Link href="/architecture">How it works</Link> follows a single question
                through both of those.
            </p>
        </>
    );
}
