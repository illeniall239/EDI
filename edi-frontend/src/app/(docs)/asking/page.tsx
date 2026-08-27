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
                Every example below was run against a real sheet rather than taken
                from a list of intents, and the ones that failed were fixed rather than
                written up. Answer quality still depends on the model you configured, so
                a weaker one will do worse on the questions even where the plumbing is
                identical. See <Link href="/models">Choosing a model</Link>.
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
                Column names do not need to be quoted or spelled exactly as the header.
                the model is reading the sheet, so &ldquo;revenue&rdquo; finds a column
                called <code>Revenue</code>.
            </p>

            <h2>Charts</h2>
            <p>
                When an answer is shaped like a chart, you get one. The backend returns a
                spec (chart type, axis, series, rows) and the browser draws it, so what
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
                            <td><code>sort revenue from largest to smallest</code></td>
                            <td>Same. <code>descending</code>, <code>high to low</code> and <code>Z-A</code> all read</td>
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
                            <td><code>filter rows where Revenue is over 5000</code></td>
                            <td>A numeric comparison</td>
                        </tr>
                        <tr>
                            <td><code>filter Units at least 10</code></td>
                            <td>Same. <code>&gt;=</code>, <code>under</code>, <code>at most</code> and the rest all read</td>
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
                Which way a sort runs is read from your sentence, not decided by the
                model. That matters on a small local model: one was asked to sort
                &ldquo;descending&rdquo; and sorted ascending, then reported success. The
                word is in the sentence, so there is nothing to infer. The model is only
                consulted when the sentence does not say, and then the default is
                ascending.
            </p>
            <p>
                Filters match on <strong>equals</strong>, <strong>contains</strong>, or a
                numeric comparison, and take a column by name or by letter
                (<code>filter column C with the value West</code>). Rows whose value is not
                a number are hidden by a comparison rather than kept, so a column with
                stray text in it does not quietly widen the result.
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
                            <td>The column removed. <code>delete the Rep column</code> works too</td>
                        </tr>
                        <tr>
                            <td><code>hide the Rep column</code></td>
                            <td>Hidden, not deleted. <code>show the Rep column</code> brings it back</td>
                        </tr>
                        <tr>
                            <td><code>rename column C to Area</code></td>
                            <td>A new header, the data untouched</td>
                        </tr>
                        <tr>
                            <td><code>add a column called Margin</code></td>
                            <td>An empty column on the end, headed <code>Margin</code></td>
                        </tr>
                        <tr>
                            <td><code>insert 2 columns before D</code></td>
                            <td>Two empty columns. <code>after D</code> puts them on the other side</td>
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

            <h2>Formulas</h2>
            <p>
                Ask for a formula and you get the formula, not the answer, with an{' '}
                <strong>Apply</strong> button under it. Nothing changes in the sheet
                until you press it, which is the point: a formula lands in cells you
                picked, so a wrong one should be something you read and ignore rather
                than something you undo.
            </p>
            <pre><code>{`what formula would sum revenue for the South region
add a column called unit_price that is revenue divided by units
give me a formula for the average units per order`}</code></pre>
            <p>
                Two things can come back. An <strong>aggregate</strong>,{' '}
                <code>=SUMIF(B:B,&quot;South&quot;,E:E)</code>, goes into one cell, and
                the button names which: click a cell in the sheet first and it goes
                there. A <strong>per-row calculation</strong>,{' '}
                <code>=E2/D2</code>, becomes a new column at the end, headed with the
                name you gave, filled down every row with the references shifted as a
                spreadsheet would shift them.
            </p>
            <p>
                It is a real formula in a real cell, not a computed value: edit a number
                the formula depends on and it recalculates, which is the reason to want
                one rather than asking for the number.
            </p>

            <h2>Naming a column</h2>
            <p>
                Anywhere a column is called for, three ways of naming it all work: the
                spreadsheet letter (<code>C</code>, and <code>AA</code> past Z), the
                position (<code>column 3</code>), or the header itself
                (<code>the Rep column</code>). They used to differ per operation:
                sorting and filtering took names while deleting and hiding took a single
                letter, which meant <code>delete the Rep column</code> failed for no
                reason a reader could see.
            </p>
            <p>
                A header wins over a letter when they collide, so a sheet with a column
                genuinely headed &ldquo;C&rdquo; is still reachable by name. A partial
                match only counts when exactly one header contains what you typed;
                otherwise you are told nothing matched rather than given a coin flip.
            </p>

            <h2>What is not there</h2>
            <p>
                Cell comments, hyperlinks and data validation are recognised by the
                classifier and then have nothing to run: they live in Univer plugins this
                build does not install, and the <code>@univerjs/*</code> packages are
                pinned as a set, so adding one is a dependency change rather than a bug
                fix. Asking for them gets you &ldquo;unable to process spreadsheet
                command&rdquo;.
            </p>
            <p>
                For those, and anything else the chat does not cover, the sheet is a real
                spreadsheet (Univer, with its own toolbar) so you can do it by hand.
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
